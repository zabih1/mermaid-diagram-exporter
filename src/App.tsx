import { useEffect, useMemo, useRef, useState } from 'react';
import mermaid from 'mermaid';
import {
  AlertTriangle,
  Check,
  Copy,
  Download,
  FileImage,
  FileText,
  Maximize2,
  Moon,
  Play,
  RotateCcw,
  Sun,
  Wand2,
} from 'lucide-react';

const starterDiagram = `flowchart LR
  A[Write Mermaid code] --> B{Render preview}
  B -->|Looks good| C[Export SVG]
  B -->|Need bitmap| D[Export PNG or JPG]
  C --> E[Use anywhere]
  D --> E`;

const examples = [
  {
    label: 'Flow',
    diagram: starterDiagram,
  },
  {
    label: 'Sequence',
    diagram: `sequenceDiagram
  participant User
  participant App
  participant Mermaid
  User->>App: Enter diagram text
  App->>Mermaid: Render SVG
  Mermaid-->>App: Preview markup
  App-->>User: Download SVG, PNG, or JPG`,
  },
  {
    label: 'Timeline',
    diagram: `timeline
  title Export workflow
  Draft : Write Mermaid syntax
  Preview : Validate and inspect
  Save : Download as SVG
  Share : Export as PNG or JPG`,
  },
];

type ExportFormat = 'svg' | 'png' | 'jpg';
type ThemeMode = 'light' | 'dark';

mermaid.initialize({
  startOnLoad: false,
  securityLevel: 'loose',
  theme: 'base',
  htmlLabels: false,
  flowchart: {
    htmlLabels: false,
  },
  themeVariables: {
    fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
    primaryColor: '#f5f8ff',
    primaryBorderColor: '#2f6fed',
    primaryTextColor: '#162033',
    lineColor: '#50627a',
    secondaryColor: '#fff7ed',
    tertiaryColor: '#ecfdf5',
  },
});

function fileSafeName(value: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized || 'mermaid-diagram';
}

function svgToBlob(svg: string) {
  return new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
}

function readSvgSize(svg: string) {
  const fallback = { width: 1200, height: 800 };
  const parsed = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const svgElement = parsed.querySelector('svg');
  const viewBox = svgElement?.getAttribute('viewBox')?.trim();

  if (viewBox) {
    const parts = viewBox.split(/\s+/).map(Number);
    if (parts.length === 4 && parts.every(Number.isFinite) && parts[2] > 0 && parts[3] > 0) {
      return { width: parts[2], height: parts[3] };
    }
  }

  const width = Number.parseFloat(svgElement?.getAttribute('width') || '');
  const height = Number.parseFloat(svgElement?.getAttribute('height') || '');

  if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
    return { width, height };
  }

  return fallback;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function svgToRasterBlob(svg: string, format: 'png' | 'jpg', scale: number, background: string) {
  const svgBlob = svgToBlob(svg);
  const url = URL.createObjectURL(svgBlob);
  const size = readSvgSize(svg);

  try {
    const image = new Image();
    image.decoding = 'async';
    image.src = url;
    await image.decode();

    const width = Math.max(1, Math.ceil(size.width * scale));
    const height = Math.max(1, Math.ceil(size.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Could not create a canvas context.');
    }

    context.fillStyle = background;
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);

    const mime = format === 'png' ? 'image/png' : 'image/jpeg';
    const quality = format === 'jpg' ? 0.94 : undefined;

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error(`Could not export ${format.toUpperCase()}.`));
        },
        mime,
        quality,
      );
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function App() {
  const [code, setCode] = useState(starterDiagram);
  const [title, setTitle] = useState('Mermaid Diagram');
  const [renderedSvg, setRenderedSvg] = useState('');
  const [error, setError] = useState('');
  const [isRendering, setIsRendering] = useState(false);
  const [exportScale, setExportScale] = useState(2);
  const [background, setBackground] = useState('#ffffff');
  const [themeMode, setThemeMode] = useState<ThemeMode>('light');
  const [lastSaved, setLastSaved] = useState('');
  const [exportError, setExportError] = useState('');
  const [exportingFormat, setExportingFormat] = useState<ExportFormat | ''>('');
  const [expanded, setExpanded] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);

  const stats = useMemo(() => {
    const lines = code.split(/\r?\n/).length;
    const chars = code.length;
    return { lines, chars };
  }, [code]);
  const exportDisabled = !renderedSvg || !!error || !!exportingFormat;

  useEffect(() => {
    let cancelled = false;
    const renderId = `diagram-${Date.now()}`;

    async function renderDiagram() {
      setIsRendering(true);
      setError('');

      try {
        setExportError('');
        await mermaid.parse(code);
        const { svg } = await mermaid.render(renderId, code);

        if (!cancelled) {
          setRenderedSvg(svg);
          setError('');
        }
      } catch (currentError) {
        if (!cancelled) {
          setError(currentError instanceof Error ? currentError.message : 'Mermaid could not render this diagram.');
        }
      } finally {
        if (!cancelled) {
          setIsRendering(false);
        }
      }
    }

    const timeout = window.setTimeout(renderDiagram, 280);
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [code]);

  useEffect(() => {
    document.documentElement.dataset.theme = themeMode;
  }, [themeMode]);

  async function exportDiagram(format: ExportFormat) {
    if (!renderedSvg || error) return;

    setExportingFormat(format);
    setExportError('');
    setLastSaved('');

    try {
      const baseName = fileSafeName(title);
      const blob =
        format === 'svg'
          ? svgToBlob(renderedSvg)
          : await svgToRasterBlob(renderedSvg, format, exportScale, background);

      downloadBlob(blob, `${baseName}.${format}`);
      setExportError('');
      setLastSaved(`${format.toUpperCase()} saved`);
    } catch (currentError) {
      const message =
        currentError instanceof DOMException && currentError.name === 'SecurityError'
          ? 'Raster export failed. Try SVG or remove HTML labels from the diagram.'
          : currentError instanceof Error
            ? currentError.message
            : `Could not export ${format.toUpperCase()}.`;

      setExportError(message);
      setLastSaved('');
    } finally {
      setExportingFormat('');
    }
  }

  async function copySvg() {
    if (!renderedSvg || error) return;
    await navigator.clipboard.writeText(renderedSvg);
    setExportError('');
    setLastSaved('SVG copied');
  }

  return (
    <main className="app-shell">
      <section className="top-bar" aria-label="Application controls">
        <div>
          <h1>Mermaid Diagram Exporter</h1>
          <p>Draft, preview, and save Mermaid diagrams as SVG, PNG, or JPG.</p>
        </div>

        <div className="top-actions">
          <button
            className="icon-button"
            type="button"
            aria-label={themeMode === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
            title={themeMode === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
            onClick={() => setThemeMode(themeMode === 'light' ? 'dark' : 'light')}
          >
            {themeMode === 'light' ? <Moon size={18} /> : <Sun size={18} />}
          </button>
          <button
            className="icon-button"
            type="button"
            aria-label="Expand preview"
            title="Expand preview"
            onClick={() => setExpanded(!expanded)}
          >
            <Maximize2 size={18} />
          </button>
        </div>
      </section>

      <section className={`workspace ${expanded ? 'preview-expanded' : ''}`}>
        <aside className="editor-panel" aria-label="Mermaid editor">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Source</span>
              <h2>Diagram Code</h2>
            </div>
            <button
              className="ghost-button"
              type="button"
              onClick={() => setCode(starterDiagram)}
              title="Reset diagram"
            >
              <RotateCcw size={16} />
              Reset
            </button>
          </div>

          <label className="field-label" htmlFor="diagram-title">
            File name
          </label>
          <input
            id="diagram-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Diagram title"
          />

          <div className="example-row" aria-label="Examples">
            {examples.map((example) => (
              <button key={example.label} type="button" onClick={() => setCode(example.diagram)}>
                <Wand2 size={15} />
                {example.label}
              </button>
            ))}
          </div>

          <label className="field-label" htmlFor="diagram-code">
            Mermaid
          </label>
          <textarea
            id="diagram-code"
            spellCheck="false"
            value={code}
            onChange={(event) => setCode(event.target.value)}
          />

          <div className="editor-footer">
            <span>{stats.lines} lines</span>
            <span>{stats.chars} characters</span>
          </div>
        </aside>

        <section className="preview-panel" aria-label="Diagram preview">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Preview</span>
              <h2>Rendered Diagram</h2>
            </div>
            <div className={`status-pill ${error ? 'error' : 'ready'}`}>
              {error ? <AlertTriangle size={15} /> : isRendering ? <Play size={15} /> : <Check size={15} />}
              {error ? 'Needs fix' : isRendering ? 'Rendering' : 'Ready'}
            </div>
          </div>

          <div className="preview-surface" ref={previewRef}>
            {error ? (
              <pre className="error-box">{error}</pre>
            ) : (
              <div className="diagram-frame" dangerouslySetInnerHTML={{ __html: renderedSvg }} />
            )}
          </div>
        </section>

        <aside className="export-panel" aria-label="Export options">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Save</span>
              <h2>Export</h2>
            </div>
          </div>

          <div className="export-grid">
            <button type="button" onClick={() => exportDiagram('svg')} disabled={exportDisabled}>
              <FileText size={18} />
              SVG
            </button>
            <button type="button" onClick={() => exportDiagram('png')} disabled={exportDisabled}>
              <FileImage size={18} />
              PNG
            </button>
            <button type="button" onClick={() => exportDiagram('jpg')} disabled={exportDisabled}>
              <FileImage size={18} />
              JPG
            </button>
          </div>

          <button className="copy-button" type="button" onClick={copySvg} disabled={exportDisabled}>
            <Copy size={17} />
            Copy SVG code
          </button>

          <div className="option-group">
            <label htmlFor="export-scale">Bitmap scale</label>
            <input
              id="export-scale"
              type="range"
              min="1"
              max="4"
              step="1"
              value={exportScale}
              onChange={(event) => setExportScale(Number(event.target.value))}
            />
            <span>{exportScale}x</span>
          </div>

          <div className="option-group">
            <label htmlFor="background-color">Background</label>
            <input
              id="background-color"
              type="color"
              value={background}
              onChange={(event) => setBackground(event.target.value)}
              aria-label="Bitmap background color"
            />
            <span>{background.toUpperCase()}</span>
          </div>

          <div className={`save-note ${exportError ? 'error' : ''}`} aria-live="polite">
            {exportError ? <AlertTriangle size={16} /> : <Download size={16} />}
            {exportError ||
              (exportingFormat ? `Saving ${exportingFormat.toUpperCase()}...` : lastSaved || 'Choose a format to download')}
          </div>
        </aside>
      </section>
    </main>
  );
}
