// @ts-nocheck
export const encodeAudioChunks = async (
  renderedBuffer: AudioBuffer,
  audioEncoder: AudioEncoder,
  sampleRate: number,
  onProgress: (current: number, total: number, phase: string) => void,
  waitForQueue: (encoder: any, limit: number) => Promise<void>,
  hasEncoderError: () => boolean
) => {
  const CHUNK_DURATION_SEC = 0.5;
  const chunkFrames = Math.floor(sampleRate * CHUNK_DURATION_SEC);
  const totalAudioFrames = renderedBuffer.length;

  const leftChannel = renderedBuffer.getChannelData(0);
  const rightChannel = renderedBuffer.getChannelData(1);

  for (let i = 0; i < totalAudioFrames; i += chunkFrames) {
    if (hasEncoderError()) break;

    await waitForQueue(audioEncoder, 20);

    const framesToEncode = Math.min(chunkFrames, totalAudioFrames - i);

    const chunkBuffer = new Float32Array(framesToEncode * 2);
    for (let j = 0; j < framesToEncode; j++) {
      chunkBuffer[j * 2] = leftChannel[i + j];
      chunkBuffer[j * 2 + 1] = rightChannel[i + j];
    }

    try {
      const audioData = new AudioData({
        format: "f32",
        sampleRate: sampleRate,
        numberOfFrames: framesToEncode,
        numberOfChannels: 2,
        timestamp: (i / sampleRate) * 1_000_000,
        data: chunkBuffer,
      });

      audioEncoder.encode(audioData);
      audioData.close();
    } catch (e) {
      console.error("Audio Chunk Encoding Error:", e);
    }

    if (i % (chunkFrames * 5) === 0) {
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  try {
    await audioEncoder.flush();
  } catch (e) {
    console.warn("Audio flush warning:", e);
  }
  audioEncoder.close();
};
