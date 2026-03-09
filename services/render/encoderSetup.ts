// @ts-nocheck
import * as Muxer from "mp4-muxer";
import * as WebMMuxer from "webm-muxer";

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

  let muxer: any;
  let videoEncoder: VideoEncoderWithState;
  let audioEncoder: AudioEncoder;

  if (format === "mp4") {
    let muxerTarget: any;

    if (fileStream) {
      if (Muxer.FileSystemWritableFileStreamTarget) {
        muxerTarget = new Muxer.FileSystemWritableFileStreamTarget(fileStream);
      } else {
        muxerTarget = new (Muxer as any).FileSystemWritableFileStreamTarget(fileStream);
      }
    } else {
      if (Muxer.ArrayBufferTarget) {
        muxerTarget = new Muxer.ArrayBufferTarget();
      } else {
        muxerTarget = new (Muxer as any).ArrayBufferTarget();
      }
    }

    const MuxerClass = Muxer.Muxer || (Muxer as any).Muxer;
    if (!MuxerClass) throw new Error("Muxer library init failed");

    muxer = new MuxerClass({
      target: muxerTarget,
      video: { codec: "avc", width, height },
      audio: { codec: "aac", sampleRate, numberOfChannels: 2 },
      fastStart: fileStream ? false : "in-memory",
    });

    videoEncoder = new VideoEncoder({
      output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
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
      output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
      error: onError,
    });

    audioEncoder.configure({
      codec: "mp4a.40.2",
      sampleRate,
      numberOfChannels: 2,
      bitrate: 128_000,
    });
  } else {
    // WebM Setup
    let muxerTarget: any;
    if (fileStream) {
      if (WebMMuxer.FileSystemWritableFileStreamTarget) {
        muxerTarget = new WebMMuxer.FileSystemWritableFileStreamTarget(fileStream);
      } else {
        muxerTarget = new (WebMMuxer as any).FileSystemWritableFileStreamTarget(fileStream);
      }
    } else {
      if (WebMMuxer.ArrayBufferTarget) {
        muxerTarget = new WebMMuxer.ArrayBufferTarget();
      } else {
        muxerTarget = new (WebMMuxer as any).ArrayBufferTarget();
      }
    }

    const MuxerClass = WebMMuxer.Muxer || (WebMMuxer as any).Muxer;
    if (!MuxerClass) throw new Error("WebM Muxer library init failed");

    muxer = new MuxerClass({
      target: muxerTarget,
      video: { codec: "V_VP9", width, height, frameRate: fps },
      audio: { codec: "A_OPUS", sampleRate, numberOfChannels: 2 },
    });

    videoEncoder = new VideoEncoder({
      output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
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
      output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
      error: onError,
    });

    audioEncoder.configure({
      codec: "opus",
      sampleRate,
      numberOfChannels: 2,
      bitrate: 128_000,
    });
  }

  return { muxer, videoEncoder, audioEncoder, width, height };
};
