# Adaptateurs Frameworks : React, Vue 3 & Tailwind CSS

Ce document fournit des implémentations idiomatiques du pop-up de nouveautés pour les frameworks modernes.

---

## ⚛️ 1. React / Next.js (Hook + Composant)

### Hook Personnalisé : `useChangelog.ts`

```typescript
import { useState, useEffect } from 'react';

export function useChangelog(currentVersion: string, storageKey = 'app_last_seen_version') {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const lastSeen = localStorage.getItem(storageKey);
    if (!lastSeen || lastSeen !== currentVersion) {
      const timer = setTimeout(() => {
        setIsOpen(true);
        localStorage.setItem(storageKey, currentVersion);
      }, 600);
      return () => clearTimeout(timer);
    }
  }, [currentVersion, storageKey]);

  const open = () => setIsOpen(true);
  const close = () => {
    setIsOpen(false);
    localStorage.setItem(storageKey, currentVersion);
  };

  return { isOpen, open, close };
}
```

### Composant Modal : `ChangelogModal.tsx`

```tsx
import React, { useEffect } from 'react';

interface ChangelogEntry {
  version: string;
  date: string;
  title: string;
  changes: string[];
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  entries: ChangelogEntry[];
}

export function ChangelogModal({ isOpen, onClose, entries }: Props) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-5 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3">
            <span className="text-2xl">✨</span>
            <div>
              <h3 className="font-bold text-slate-100 flex items-center gap-2">
                Nouveautés & Historique
                <span className="bg-sky-500/10 text-sky-400 border border-sky-500/30 text-xs px-2 py-0.5 rounded-full">
                  v{entries[0]?.version}
                </span>
              </h3>
              <p className="text-xs text-slate-400">Évolutions et améliorations récentes</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-slate-800 transition"
          >
            ✕
          </button>
        </div>

        {/* Timeline */}
        <div className="p-5 overflow-y-auto max-h-[55vh] flex flex-col gap-4">
          {entries.map((item, idx) => (
            <div 
              key={item.version}
              className={`p-4 rounded-xl border ${
                idx === 0 
                  ? 'bg-sky-500/5 border-sky-500/30 shadow-lg shadow-sky-500/5' 
                  : 'bg-slate-800/20 border-slate-800'
              }`}
            >
              <span className={`text-xs font-semibold ${idx === 0 ? 'text-sky-400' : 'text-slate-400'}`}>
                v{item.version} {idx === 0 && '• Actuelle'} ({item.date})
              </span>
              <h4 className="font-semibold text-slate-200 mt-1 mb-2">{item.title}</h4>
              <ul className="list-disc pl-5 text-sm text-slate-300 space-y-1.5">
                {item.changes.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 flex justify-end bg-slate-950/40">
          <button 
            onClick={onClose}
            className="bg-sky-600 hover:bg-sky-500 text-white font-medium px-5 py-2 rounded-xl text-sm transition shadow-lg shadow-sky-600/20"
          >
            C'est noté !
          </button>
        </div>
      </div>
    </div>
  );
}
```

---

## 💚 2. Vue 3 / Nuxt (Composition API)

### Composant : `ChangelogModal.vue`

```vue
<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'

const props = defineProps<{
  currentVersion: string
  entries: Array<{
    version: string
    date: string
    title: string
    changes: string[]
  }>
}>()

const isOpen = ref(false)
const STORAGE_KEY = 'vue_app_last_seen_version'

const open = () => {
  isOpen.value = true
  document.body.style.overflow = 'hidden'
}

const close = () => {
  isOpen.value = false
  document.body.style.overflow = ''
  localStorage.setItem(STORAGE_KEY, props.currentVersion)
}

const handleKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Escape' && isOpen.value) close()
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
  const lastSeen = localStorage.getItem(STORAGE_KEY)
  if (!lastSeen || lastSeen !== props.currentVersion) {
    setTimeout(() => {
      open()
      localStorage.setItem(STORAGE_KEY, props.currentVersion)
    }, 600)
  }
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
  document.body.style.overflow = ''
})

defineExpose({ open, close })
</script>

<template>
  <Teleport to="body">
    <div 
      v-if="isOpen" 
      class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
      @click.self="close"
    >
      <div class="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        <!-- Header -->
        <div class="p-5 flex items-center justify-between border-b border-zinc-800">
          <div class="flex items-center gap-3">
            <span class="text-2xl">✨</span>
            <div>
              <h3 class="font-bold text-zinc-100 flex items-center gap-2">
                Nouveautés & Versions
                <span class="bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-xs px-2 py-0.5 rounded-full">
                  v{{ currentVersion }}
                </span>
              </h3>
            </div>
          </div>
          <button @click="close" class="text-zinc-400 hover:text-white p-2">✕</button>
        </div>

        <!-- Timeline -->
        <div class="p-5 overflow-y-auto max-h-[55vh] flex flex-col gap-4">
          <div 
            v-for="(item, idx) in entries" 
            :key="item.version"
            :class="[
              'p-4 rounded-xl border',
              idx === 0 ? 'bg-emerald-500/5 border-emerald-500/30' : 'bg-zinc-800/30 border-zinc-800'
            ]"
          >
            <span class="text-xs font-semibold text-emerald-400">
              v{{ item.version }} {{ idx === 0 ? '• Actuelle' : '' }} ({{ item.date }})
            </span>
            <h4 class="font-semibold text-zinc-200 mt-1 mb-2">{{ item.title }}</h4>
            <ul class="list-disc pl-5 text-sm text-zinc-300 space-y-1">
              <li v-for="(change, i) in item.changes" :key="i">{{ change }}</li>
            </ul>
          </div>
        </div>

        <!-- Footer -->
        <div class="p-4 border-t border-zinc-800 flex justify-end">
          <button @click="close" class="bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2 rounded-xl text-sm font-medium">
            Compris !
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
```
