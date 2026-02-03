
export interface ImageDecodeResult {
    image: VideoFrame;
    complete: boolean;
}

export interface ImageDecoderInit {
    type: string;
    data: BufferSource;
}

export declare class ImageDecoder {
    constructor(init: ImageDecoderInit);
    decode(options: { frameIndex: number }): Promise<ImageDecodeResult>;
    close(): void;
    readonly tracks: {
        selectedTrack: {
            frameCount: number;
        } | null;
        ready: Promise<void>;
    };
    readonly complete: boolean;
}

export class GifController {
    private frames: { bitmap: ImageBitmap, duration: number }[] = [];
    private totalDuration: number = 0;
    private url: string = '';
    public isLoaded: boolean = false;

    async load(url: string) {
        if (this.url === url && this.isLoaded) return;
        this.dispose();
        this.url = url;

        try {
            // Feature check
            if (typeof ImageDecoder === 'undefined') {
                return; // Fallback to static image handled by caller
            }

            const response = await fetch(url);
            const data = await response.arrayBuffer();
            
            // Try decoding as GIF
            const decoder = new ImageDecoder({ type: 'image/gif', data });
            
            await decoder.tracks.ready;
            const track = decoder.tracks.selectedTrack;
            
            if (!track || track.frameCount <= 1) {
                // Not an animated GIF or just one frame, let standard Image handle it for better performance
                decoder.close();
                return;
            }

            for (let i = 0; i < track.frameCount; i++) {
                const result = await decoder.decode({ frameIndex: i });
                const vf = result.image;
                
                // Duration in microseconds -> milliseconds (default 100ms)
                const duration = vf.duration ? vf.duration / 1000 : 100; 
                
                const bitmap = await createImageBitmap(vf);
                vf.close(); 
                
                this.frames.push({ bitmap, duration });
            }
            
            decoder.close();
            
            this.totalDuration = this.frames.reduce((acc, f) => acc + f.duration, 0);
            this.isLoaded = true;
        } catch (e) {
            // Silent fail, caller will use static image
            // console.warn("GIF Decoding skipped or failed", e);
        }
    }

    getFrame(timestampMs: number): ImageBitmap | null {
        if (!this.isLoaded || this.frames.length === 0) return null;
        
        const t = timestampMs % this.totalDuration;
        let acc = 0;
        for (const frame of this.frames) {
            if (t >= acc && t < acc + frame.duration) {
                return frame.bitmap;
            }
            acc += frame.duration;
        }
        return this.frames[0].bitmap;
    }

    dispose() {
        this.frames.forEach(f => f.bitmap.close());
        this.frames = [];
        this.isLoaded = false;
        this.totalDuration = 0;
    }
}
