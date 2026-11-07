import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, Cpu, LockKeyhole, Sparkles } from 'lucide-react'

export const MODELS = [
  { id: 'beam', label: 'Beam', vendor: 'Ollama Cloud', tier: 'Fast coding', kind: 'ollama' },
  { id: 'gemma4', label: 'Gemma 4', vendor: 'Ollama Cloud', tier: 'General purpose', kind: 'ollama' },
  { id: 'gptLuna', label: 'GPT 6 Luna', vendor: 'OpenAI', tier: 'Fast responses', kind: 'openai', pro: true },
  { id: 'gptAstra', label: 'GPT 6 Astra', vendor: 'OpenAI', tier: 'Advanced reasoning', kind: 'openai', pro: true },
  { id: 'claudeSonnet', label: 'Claude Sonnet 5.5', vendor: 'Anthropic', tier: 'Balanced coding', kind: 'anthropic', pro: true },
  { id: 'claudeOpus', label: 'Claude Opus 5.5', vendor: 'Anthropic', tier: 'Deep reasoning', kind: 'anthropic', pro: true },
]

export default function ModelSelector({ value, onChange, compact = false, isPro = false, onLocked }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const selected = MODELS.find((model) => model.id === value) || MODELS[0]

  useEffect(() => {
    function onPointerDown(event) {
      if (!ref.current?.contains(event.target)) setOpen(false)
    }
    function onKeyDown(event) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [])

  return (
    <div className="model-select" ref={ref}>
      <button className={`model-trigger ${compact ? 'model-trigger-compact' : ''}`} onClick={() => setOpen((current) => !current)} aria-expanded={open} type="button">
        <span className={`provider-dot ${selected.kind}`}><Sparkles size={13} /></span>
        <span>{selected.label}</span>
        <ChevronDown size={14} className={open ? 'rotate-180' : ''} />
      </button>
      {open && (
        <div className="model-menu pop-in" role="listbox" aria-label="Choose an AI model">
          <div className="model-menu-heading">Choose a model</div>
          {MODELS.map((model) => {
            const proOnly = model.pro === true
            const locked = proOnly && !isPro
            return (
              <button key={model.id} className={`model-option ${model.id === selected.id ? 'selected' : ''} ${locked ? 'model-option-locked' : ''}`} onClick={() => { if (locked) { setOpen(false); onLocked?.(model); return } onChange(model.id); setOpen(false) }} type="button" role="option" aria-selected={model.id === selected.id} aria-disabled={locked}>
                <span className={`provider-dot ${model.kind}`}><Cpu size={13} /></span>
                <span className="model-option-copy"><b>{model.label}</b><small>{model.vendor} · {model.tier}</small></span>
                {locked ? <span className="model-pro-lock"><LockKeyhole size={11} /> Pro</span> : model.id === selected.id ? <Check size={16} /> : null}
              </button>
            )
          })}
          <div className="model-menu-foot">{isPro ? 'Models require their provider API key in Vercel.' : 'GPT and Claude are exclusive to Perfectly Pro.'}</div>
        </div>
      )}
    </div>
  )
}
