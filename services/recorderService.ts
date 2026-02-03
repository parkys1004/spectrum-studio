
export class RecorderService {
  private mediaRecorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];

  start(canvas: HTMLCanvasElement, audioStream: MediaStream) {
    const videoStream = canvas.captureStream(60); // 60 FPS
    
    // Check if audioStream has tracks
    const tracks = [...videoStream.getVideoTracks()];
    if (audioStream && audioStream.getAudioTracks().length > 0) {
        tracks.push(audioStream.getAudioTracks()[0]);
    }

    const combinedStream = new MediaStream(tracks);

    // Prioritize MP4 (H.264) for compatibility, fallback to WebM
    const mimeTypes = [
        'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
        'video/mp4',
        'video/webm;codecs=h264',
        'video/webm;codecs=vp9', 
        'video/webm'
    ];
    
    let selectedMimeType = 'video/webm';
    for (const type of mimeTypes) {
        if (MediaRecorder.isTypeSupported(type)) {
            selectedMimeType = type;
            break;
        }
    }

    this.mediaRecorder = new MediaRecorder(combinedStream, {
      mimeType: selectedMimeType,
      videoBitsPerSecond: 12000000 // 12 Mbps for High Quality Full HD
    });

    this.chunks = [];
    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        this.chunks.push(e.data);
      }
    };
    this.mediaRecorder.start();
  }

  async stop(): Promise<{ url: string, filename: string }> {
    return new Promise((resolve) => {
      if (!this.mediaRecorder) return resolve({ url: '', filename: '' });

      this.mediaRecorder.onstop = () => {
        const type = this.mediaRecorder?.mimeType || 'video/webm';
        const blob = new Blob(this.chunks, { type });
        const url = URL.createObjectURL(blob);
        const ext = type.includes('mp4') ? 'mp4' : 'webm';
        resolve({ url, filename: `Playlist_Video_Export_${Date.now()}.${ext}` });
        this.mediaRecorder = null;
      };
      
      this.mediaRecorder.stop();
    });
  }
}

export const recorderService = new RecorderService();
