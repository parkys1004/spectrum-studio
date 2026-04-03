// @ts-nocheck
import {
  Output,
  Mp4OutputFormat,
  WebMOutputFormat,
  BufferTarget,
  StreamTarget,
  EncodedVideoPacketSource,
  EncodedAudioPacketSource,
  EncodedPacket
} from "mediabunny";

export const setupEncoders = (
  format: "mp4" | "webm",
  resolution: "1080p" | "720p" | "1080p_vertical" | "720p_vertical" | "1080p_square",
  fps: number,
  sampleRate: number,
  fileStream: any,
  onError: (e: any) => void
) => {
  let width = 1920;
  let height = 1080;
  let bitrate = 6_000_000;

  switch (resolution) {
    case "1080p":
      width = 1920;
      height = 1080;
      bitrate = 6_000_000;
      break;
    case "720p":
      width = 1280;
      height = 720;
      bitrate = 3_000_000;
      break;
    case "1080p_vertical":
      width = 1080;
      height = 1920;
      bitrate = 6_000_000;
      break;
    case "720p_vertical":
      width = 720;
      height = 1280;
      bitrate = 3_000_000;
      break;
    case "1080p_square":
      width = 1080;
      height = 1080;
      bitrate = 5_000_000;
      break;
  }

  let muxerTarget: any;
  if (fileStream) {
    muxerTarget = new StreamTarget(fileStream);
  } else {
    muxerTarget = new BufferTarget();
  }

  let outputFormat = format === "mp4" ? new Mp4OutputFormat() : new WebMOutputFormat();
  
  let output = new Output({
    format: outputFormat,
    target: muxerTarget
  });

  let videoSource = new EncodedVideoPacketSource(format === "mp4" ? "avc" : "vp9");
  let audioSource = new EncodedAudioPacketSource(format === "mp4" ? "aac" : "opus");

  output.addVideoTrack(videoSource, { width, height, frameRate: fps });
  output.addAudioTrack(audioSource, { sampleRate, numberOfChannels: 2 });

  output.start();

  let videoEncoder: VideoEncoderWithState;
  let audioEncoder: AudioEncoder;

  if (format === "mp4") {
    videoEncoder = new VideoEncoder({
      output: (chunk, meta) => videoSource.add(EncodedPacket.fromEncodedChunk(chunk), meta),
      error: onError,
    }) as VideoEncoderWithState;

    const codecConfig = {
      codec: "avc1.4d002a", // Main Profile, Level 4.2
      width,
      height,
      bitrate,
      framerate: fps,
      hardwareAcceleration: "prefer-hardware" as const,
    };

    try {
      videoEncoder.configure(codecConfig);
    } catch (e) {
      console.warn("Hardware config failed, trying generic AVC", e);
      videoEncoder.configure({
        codec: "avc1.42002a",
        width,
        height,
        bitrate,
        framerate: fps,
        hardwareAcceleration: "no-preference",
      });
    }

    audioEncoder = new AudioEncoder({
      output: (chunk, meta) => audioSource.add(EncodedPacket.fromEncodedChunk(chunk), meta),
      error: onError,
    });

    audioEncoder.configure({
      codec: "mp4a.40.2",
      sampleRate,
      numberOfChannels: 2,
      bitrate: 128_000,
    });
  } else {
    videoEncoder = new VideoEncoder({
      output: (chunk, meta) => videoSource.add(EncodedPacket.fromEncodedChunk(chunk), meta),
      error: onError,
    }) as VideoEncoderWithState;

    videoEncoder.configure({
      codec: "vp09.00.10.08", // VP9 Profile 0, Level 1, BitDepth 8
      width,
      height,
      bitrate,
      framerate: fps,
    });

    audioEncoder = new AudioEncoder({
      output: (chunk, meta) => audioSource.add(EncodedPacket.fromEncodedChunk(chunk), meta),
      error: onError,
    });

    audioEncoder.configure({
      codec: "opus",
      sampleRate,
      numberOfChannels: 2,
      bitrate: 128_000,
    });
  }

  // Mock the old muxer interface so renderService.ts doesn't break
  const muxer = {
    finalize: () => output.finalize(),
    target: muxerTarget
  };

  return { muxer, videoEncoder, audioEncoder, width, height };
};
