/** Play MediaRecorder WebM containers through the browser's streaming demuxer. */
export async function recordingObjectUrl(blob: Blob): Promise<string> {
  if (!blob.type.startsWith('video/webm') || typeof MediaSource === 'undefined') {
    return URL.createObjectURL(blob);
  }

  const header = new TextDecoder('latin1').decode(await blob.slice(0, 4096).arrayBuffer());
  const videoCodec = header.includes('V_VP9') ? 'vp9' : header.includes('V_VP8') ? 'vp8' : null;
  const audioCodec = header.includes('A_OPUS') ? 'opus' : header.includes('A_VORBIS') ? 'vorbis' : null;
  const codecs = [videoCodec, audioCodec].filter(Boolean).join(',');
  const mime = `video/webm;codecs="${codecs}"`;
  if (!videoCodec || !MediaSource.isTypeSupported(mime)) return URL.createObjectURL(blob);

  const data = await blob.arrayBuffer();
  const media = new MediaSource();
  media.addEventListener('sourceopen', () => {
    // Reopening a previously selected clip needs a fresh buffer after detach.
    if (media.sourceBuffers.length) return;
    try {
      const buffer = media.addSourceBuffer(mime);
      buffer.addEventListener('updateend', () => {
        if (media.readyState === 'open' && !buffer.updating) media.endOfStream();
      }, { once: true });
      buffer.addEventListener('error', () => {
        console.error('[Recording] streaming decoder rejected the recording');
        if (media.readyState === 'open') media.endOfStream('decode');
      }, { once: true });
      buffer.appendBuffer(data);
    } catch (error) {
      console.error('[Recording] could not initialize recording playback', error);
      if (media.readyState === 'open') media.endOfStream('decode');
    }
  });
  return URL.createObjectURL(media);
}
