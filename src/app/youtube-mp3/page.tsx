'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Download, Loader2, Music, Search, HardDrive } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import type { YoutubeVideoInfo } from '@/lib/youtube-mp3-shared';
import { formatDuration } from '@/lib/youtube-mp3-shared';

type Step = 'idle' | 'info' | 'downloading';

export default function YoutubeMp3Page() {
  const { toast } = useToast();
  const [url, setUrl] = useState('');
  const [step, setStep] = useState<Step>('idle');
  const [loadingInfo, setLoadingInfo] = useState(false);
  const [info, setInfo] = useState<YoutubeVideoInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchInfo = async () => {
    setError(null);
    setInfo(null);
    setLoadingInfo(true);
    setStep('idle');

    try {
      const res = await fetch(`/api/youtube-mp3/info?url=${encodeURIComponent(url.trim())}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? 'No se pudo leer el video.');
      }
      setInfo(data as YoutubeVideoInfo);
      setStep('info');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error al buscar el video.';
      setError(msg);
      toast({ variant: 'destructive', title: 'Error', description: msg });
    } finally {
      setLoadingInfo(false);
    }
  };

  const downloadMp3 = async () => {
    setError(null);
    setStep('downloading');

    try {
      const res = await fetch('/api/youtube-mp3/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Error al descargar el MP3.');
      }

      const blob = await res.blob();
      const disposition = res.headers.get('Content-Disposition') ?? '';
      const match = disposition.match(/filename="([^"]+)"/i);
      const filename = match?.[1] ?? `${info?.title ?? 'audio'}.mp3`;

      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(objectUrl);

      toast({ title: 'Descarga lista', description: filename });
      setStep('info');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error al convertir.';
      setError(msg);
      setStep('info');
      toast({ variant: 'destructive', title: 'Error', description: msg });
    }
  };

  const busy = loadingInfo || step === 'downloading';

  return (
    <section className="max-w-2xl mx-auto space-y-6">
      <section className="text-center space-y-2">
        <section className="inline-flex items-center justify-center gap-2 text-primary">
          <Music className="w-10 h-10" />
        </section>
        <h1 className="text-4xl font-headline text-primary">YouTube → MP3</h1>
        <p className="text-muted-foreground">
          Convertidor local: el audio se descarga y convierte en tu máquina con yt-dlp y ffmpeg.
        </p>
      </section>

      <Alert>
        <HardDrive className="h-4 w-4" />
        <AlertTitle>Solo en local</AlertTitle>
        <AlertDescription>
          Funciona con <code className="text-xs">npm run dev</code> en tu PC. No usa servicios
          externos ni sube archivos a la nube.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>Enlace de YouTube</CardTitle>
          <CardDescription>
            Pegá la URL del video (watch, Shorts o youtu.be) y obtené la vista previa antes de
            descargar.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <section className="space-y-2">
            <Label htmlFor="yt-url">URL</Label>
            <Input
              id="yt-url"
              type="url"
              placeholder="https://www.youtube.com/watch?v=..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={busy}
            />
          </section>

          <section className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={fetchInfo}
              disabled={!url.trim() || busy}
            >
              {loadingInfo ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Search className="mr-2 h-4 w-4" />
              )}
              Vista previa
            </Button>
            <Button
              type="button"
              onClick={downloadMp3}
              disabled={!url.trim() || busy}
            >
              {step === 'downloading' ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              Descargar MP3
            </Button>
          </section>

          {error && (
            <Alert variant="destructive">
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {info && (
            <section className="flex gap-4 rounded-lg border bg-muted/30 p-4">
              {info.thumbnail && (
                <Image
                  src={info.thumbnail}
                  alt=""
                  width={120}
                  height={90}
                  className="rounded-md object-cover shrink-0"
                  unoptimized
                />
              )}
              <section className="min-w-0 space-y-1">
                <p className="font-medium leading-snug line-clamp-3">{info.title}</p>
                {info.uploader && (
                  <p className="text-sm text-muted-foreground">{info.uploader}</p>
                )}
                <p className="text-sm text-muted-foreground">
                  Duración: {formatDuration(info.duration)}
                </p>
              </section>
            </section>
          )}

          {step === 'downloading' && (
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Descargando y convirtiendo… puede tardar según la duración del video.
            </p>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
