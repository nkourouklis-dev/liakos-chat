import { useEffect, useRef, useState } from "react";
import { postUpdate, uploadMedia } from "../services/api";

export default function Camera() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const [ready, setReady] = useState(false);
  const [recording, setRecording] = useState(false);
  const [preview, setPreview] = useState<Blob | null>(null);
  const [caption, setCaption] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => () => streamRef.current?.getTracks().forEach((track) => track.stop()), []);

  async function openCamera() {
    setStatus(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: true });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setReady(true);
    } catch {
      setStatus("Χρειάζεται άδεια για κάμερα και μικρόφωνο.");
    }
  }

  async function startRecording() {
    if (!ready) {
      await openCamera();
      return;
    }
    const stream = streamRef.current;
    if (!stream) return;
    const candidates = ["video/mp4", "video/webm;codecs=vp9", "video/webm"];
    const mimeType = candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
    const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    chunksRef.current = [];
    recorder.ondataavailable = (event) => event.data.size && chunksRef.current.push(event.data);
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "video/mp4" });
      setPreview(blob);
      stream.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setReady(false);
    };
    recorder.start();
    recorderRef.current = recorder;
    setRecording(true);
  }

  function stopRecording() {
    recorderRef.current?.stop();
    setRecording(false);
  }

  async function publish() {
    if (!preview || busy) return;
    setBusy(true);
    setStatus("Ανεβαίνει...");
    try {
      const key = await uploadMedia(preview);
      await postUpdate(key, caption);
      setPreview(null);
      setCaption("");
      setStatus("Δημοσιεύτηκε στο Feed ✓");
    } catch {
      setStatus("Δεν ανέβηκε. Δοκίμασε ξανά.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page-shell flex flex-col">
      <header className="mb-4">
        <h1 className="screen-title">🎥 Video</h1>
        <p className="screen-subtitle">Τράβα κάτι και μοιράσου το με όλους</p>
      </header>

      <section className="relative min-h-0 flex-1 overflow-hidden rounded-[2rem] border border-white/10 bg-black shadow-2xl">
        <video ref={videoRef} className="h-full min-h-[46vh] w-full object-cover" muted playsInline />

        {!ready && !preview && (
          <button onClick={openCamera} className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gradient-to-b from-black/10 to-black/70 p-7 text-center">
            <span className="text-7xl">🎥</span>
            <span className="text-2xl font-black">Άνοιξε την κάμερα</span>
            <span className="text-base text-white/70">Πάτησε εδώ για να ξεκινήσεις</span>
          </button>
        )}

        {recording && <div className="absolute left-4 top-4 rounded-full bg-red-600 px-4 py-2 text-sm font-black">● ΕΓΓΡΑΦΗ</div>}

        {preview && <video className="absolute inset-0 h-full w-full object-contain" src={URL.createObjectURL(preview)} controls playsInline />}
      </section>

      <div className="mt-4 space-y-3">
        {!preview && (
          <button className={`primary-action ${recording ? "bg-red-600" : ""}`} onClick={recording ? stopRecording : startRecording}>
            {recording ? "■ Σταμάτησε" : ready ? "● Γράψε video" : "🎥 Άνοιξε κάμερα"}
          </button>
        )}

        {preview && (
          <>
            <input className="input text-base" placeholder="Γράψε μια λεζάντα..." value={caption} maxLength={120} onChange={(e) => setCaption(e.target.value)} />
            <div className="grid grid-cols-2 gap-3">
              <button className="secondary-action" onClick={() => setPreview(null)}>Ξανά</button>
              <button className="primary-action" disabled={busy} onClick={publish}>{busy ? "Ανεβαίνει..." : "📣 Δημοσίευση"}</button>
            </div>
          </>
        )}
        {status && <p className="text-center text-sm font-semibold text-white/70">{status}</p>}
      </div>
    </main>
  );
}
