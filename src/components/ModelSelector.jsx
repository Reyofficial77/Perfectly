import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, Cpu, Sparkles } from 'lucide-react'

export const MODELS = [
  { id: 'beam', label: 'Beam', vendor: 'Ollama Cloud', tier: 'Fast coding', kind: 'ollama' },
  { id: 'gemma4', label: 'Gemma 4', vendor: 'Ollama Cloud', tier: 'General purpose', kind: 'ollama' },
  { id: 'gptLuna', label: 'GPT 6 Luna', vendor: 'OpenAI', tier: 'Fast responses', kind: 'openai' },
  { id: 'gptAstra', label: 'GPT 6 Astra', vendor: 'OpenAI', tier: 'Advanced reasoning', kind: 'openai' },
  { id: 'claudeSonnet', label: 'Claude Sonnet 5.5', vendor: 'Anthropic', tier: 'Balanced coding', kind: 'anthropic' },
  { id: 'claudeOpus', label: 'Claude Opus 5.5', vendor: 'Anthropic', tier: 'Deep reasoning', kind: 'anthropic' },
]

export default function ModelSelector({ value, onChange, compact = false }) {
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
          {MODELS.map((model) => (
            <button key={model.id} className={`model-option ${model.id === selected.id ? 'selected' : ''}`} onClick={() => { onChange(model.id); setOpen(false) }} type="button" role="option" aria-selected={model.id === selected.id}>
              <span className={`provider-dot ${model.kind}`}><Cpu size={13} /></span>
              <span className="model-option-copy"><b>{model.label}</b><small>{model.vendor} · {model.tier}</small></span>
              {model.id === selected.id && <Check size={16} />}
            </button>
          ))}
          <div className="model-menu-foot">Models require their provider API key in Vercel.</div>
        </div>
      )}
    </div>
  )
}
