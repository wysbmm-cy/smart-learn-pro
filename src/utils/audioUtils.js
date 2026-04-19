/**
 * Audio Utility for Browser-side Audio Processing
 * Supports decoding, slicing, and WAV encoding
 */

/**
 * Decode an audio Blob/File into an AudioBuffer
 * @param {Blob} blob 
 * @returns {Promise<AudioBuffer>}
 */
export const decodeAudioData = async (blob) => {
    const arrayBuffer = await blob.arrayBuffer();
    const audioContent = new (window.AudioContext || window.webkitAudioContext)();
    return await audioContent.decodeAudioData(arrayBuffer);
};

/**
 * Slice an AudioBuffer into a new AudioBuffer
 * @param {AudioBuffer} buffer 
 * @param {number} startSeconds 
 * @param {number} endSeconds 
 * @returns {AudioBuffer}
 */
export const sliceAudioBuffer = (buffer, startSeconds, endSeconds) => {
    const sampleRate = buffer.sampleRate;
    const startOffset = Math.floor(startSeconds * sampleRate);
    const endOffset = Math.floor(endSeconds * sampleRate);
    const frameCount = endOffset - startOffset;

    if (frameCount <= 0) throw new Error("Invalid slice range");

    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const newBuffer = audioContext.createBuffer(
        buffer.numberOfChannels,
        frameCount,
        sampleRate
    );

    for (let i = 0; i < buffer.numberOfChannels; i++) {
        const channelData = buffer.getChannelData(i);
        const slicedData = channelData.subarray(startOffset, endOffset);
        newBuffer.copyToChannel(slicedData, i);
    }

    return newBuffer;
};

/**
 * Encode an AudioBuffer into a WAV Blob
 * @param {AudioBuffer} buffer 
 * @returns {Blob}
 */
export const audioBufferToWav = (buffer) => {
    const numOfChan = buffer.numberOfChannels;
    const length = buffer.length * numOfChan * 2 + 44;
    const bufferArr = new ArrayBuffer(length);
    const view = new DataView(bufferArr);
    const channels = [];
    let i, sample, offset = 0, pos = 0;

    // RIFF identifier
    setUint32(0x46464952);
    // file length
    setUint32(length - 8);
    // RIFF type
    setUint32(0x45564157);
    // format chunk identifier
    setUint32(0x20746d66);
    // format chunk length
    setUint32(16);
    // sample format (raw)
    setUint16(1);
    // channel count
    setUint16(numOfChan);
    // sample rate
    setUint32(buffer.sampleRate);
    // byte rate (sample rate * block align)
    setUint32(buffer.sampleRate * numOfChan * 2);
    // block align (channel count * bytes per sample)
    setUint16(numOfChan * 2);
    // bits per sample
    setUint16(16);
    // data chunk identifier
    setUint32(0x61746164);
    // data chunk length
    setUint32(length - pos - 4);

    // Write interleaved samples
    for (i = 0; i < buffer.numberOfChannels; i++) {
        channels.push(buffer.getChannelData(i));
    }

    while (pos < length) {
        for (i = 0; i < numOfChan; i++) {
            sample = Math.max(-1, Math.min(1, channels[i][offset])); // clamp
            sample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF; // scale to 16-bit
            view.setInt16(pos, sample, true); // write as 16-bit PCM
            pos += 2;
        }
        offset++;
    }

    return new Blob([bufferArr], { type: 'audio/wav' });

    function setUint16(data) {
        view.setUint16(pos, data, true);
        pos += 2;
    }

    function setUint32(data) {
        view.setUint32(pos, data, true);
        pos += 4;
    }
};
