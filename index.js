const MESSAGE_TYPES = {
    NOTE_OFF: 'noteOff',       // Key released
    NOTE_ON: 'noteOn',       // Key pressed
    AFTER_TOUCH: 'afterTouch',       // Key pressure is changing
    CONTROLLER: 'controller',       // CC/controller motion
    PROGRAM_CHANGE: 'programChange',       // Patch/bank or program change
    CHANNEL_PRESSURE: 'channelPressure',       // Average key pressure is changing
    PITCH_BEND: 'pitchBend',       // Pitch wheel motion
    SYSTEM: 'system',       // SysEx message of some sort
};

const NOTE_OFF = 0b1000;
const NOTE_ON = 0b1001;
const AFTER_TOUCH = 0b1010;
const CONTROLLER = 0b1011;
const PROGRAM_CHANGE = 0b1100;
const CHANNEL_PRESSURE = 0b1101;
const PITCH_BEND = 0b1110;
const SYSTEM = 0b1111;

const MESSAGE_PARAMS = [
    'Key',          // 0-127 (7 bit 60 = C3 / middle C )
    'Velocity',     // 0-127 (7 bit)
    'Pressure',     // 0-127 (7 bit)
    'Controller',   // 0-127 (7 bit)
    'Value',        // 0-127 (7 bit)
    'Preset',       // 0-127 (7 bit)
    'BendUpper',    // Upper: 0-16383 (14 bit)
    'BendLower',    // Lower: 0-16383 (14 bit)
];

const MIDI_PARAM_MAP = {
    noteOff: ['Key', 'Velocity'],
    noteOn: ['Key', 'Velocity'],
    afterTouch: ['Key', 'Pressure'],
    controller: ['Controller', 'Value'],
    programChange: ['Preset'],
    channelPressure: ['Pressure'],
    pitchBend: ['BendUpper', 'BendLower'],
};

const KEY_NAMES = ['A', 'A#', 'B', 'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#'];
const A0 = 21;
const C1 = 24;

function keyToString(key) {
    return KEY_NAMES[(key - A0) % 12] + Math.floor((key - C1) / 12 + 1);
}

let KEYS_VELOCITY = new Array(88).fill(0);
let KEYS_DOWN = new Array(88).fill(0);
let pedalDown = false;

function parse(message) {
    const now = Tone.context.currentTime;
    let status = message[0];
    let messageType = status >> 4;
    let channel = status % 16;
    if (messageType !== SYSTEM) {
        if (messageType === NOTE_ON) {
            const key = message[1];
            const velocity = message[2];
            const keyName = keyToString(key);
            const gain = Math.min(1, Math.max(0, (velocity / 100 - .1) / .8));
            if (velocity) {
                sampler.triggerAttack(keyName, now, gain);
            } else {
                if (!pedalDown) {
                    sampler.triggerRelease(keyName, now);
                }
            }

            // Don't update velocity if pedal is down on key release.
            if (!pedalDown || velocity) {
                KEYS_VELOCITY[key - A0] = velocity;
            }

            KEYS_DOWN[key - A0] = velocity ? 1 : 0;
        } else if (messageType === CONTROLLER) {
            const controller = message[1];
            const value = message[2];
            pedalDown = value > 0;
            if (!pedalDown) {
                const keysStopped = [];
                for (let i = 0; i < KEYS_DOWN.length; i++) {
                    if (!KEYS_DOWN[i]) {
                        KEYS_VELOCITY[i] = 0;
                        keysStopped.push(keyToString(i + A0))
                    }
                }

                sampler.triggerRelease(keysStopped, now);
            }
        }
    }
}

let previousFrameData;
let direction = 1; // 0 for up to down, 1 for bottom to top
let speed = 1;
let lastFrameTime;

function frame() {
    const currentFrameTime = performance.now();
    let adjustedSpeed = lastFrameTime ? speed * (lastFrameTime - currentFrameTime) * 240 : speed;
    lastFrameTime = currentFrameTime;
    const canvas = document.getElementById('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    if (previousFrameData) {
        ctx.putImageData(previousFrameData, 0, (1 - direction) * speed);
    }

    ctx.fillStyle = 'teal';
    const keyWidth = canvas.width / KEYS_VELOCITY.length;
    for (let i = 0; i < KEYS_VELOCITY.length; i++) {
        ctx.globalAlpha = Math.abs(KEYS_VELOCITY[i]) / 100;
        ctx.fillRect(keyWidth * i, direction * (canvas.height - speed), keyWidth, speed);

        KEYS_VELOCITY[i] *= 0.995;
    }

    previousFrameData = ctx.getImageData(0, direction * speed, canvas.width, canvas.height - speed);

    requestAnimationFrame(frame);
}

const sampler = new Tone.Sampler({
    urls: {
        "C4": "C4.mp3",
        "D#4": "Ds4.mp3",
        "F#4": "Fs4.mp3",
        "A4": "A4.mp3",
        "C5": "C5.mp3",
        "D#5": "Ds5.mp3",
        "F#5": "Fs5.mp3",
        "A5": "A5.mp3",
        "C6": "C6.mp3",
        "D#6": "Ds6.mp3",
        "F#6": "Fs6.mp3",
        "A6": "A6.mp3",
        "C7": "C7.mp3",
        "D#7": "Ds7.mp3",
        "F#7": "Fs7.mp3",
        "A7": "A7.mp3",
        "C8": "C8.mp3",
    },
    release: 1,
    baseUrl: "salamander/",
}).toDestination();
Tone.context.lookAhead = 0;

$(document).ready(() => {
    const startButton = document.getElementById('start');

    startButton.addEventListener('click', e => {
        $(startButton).hide();
        Tone.start();
        requestAnimationFrame(frame);

        function onMIDISuccess(midiAccess) {
            console.log('MIDI ready!');
            let inputs = [...midiAccess.inputs.values()];
            if (inputs.length === 0) {
                console.log('No devices detected');
            } else {
                let input = inputs[0];
                console.log(`Connected to ${input.name}`);
                input.onmidimessage = (message) => {
                    parse(message.data);
                };
            }
        }

        function onMIDIFailure(msg) {
            console.error(`Failed to get MIDI access - ${msg}`);
        }

        navigator.requestMIDIAccess({ sysex: false }).then(onMIDISuccess, onMIDIFailure);
    });
});
