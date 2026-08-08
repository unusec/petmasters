<template>
  <div ref="containerRef" class="milkdown-crepe-container" />
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { Crepe } from '@milkdown/crepe'
import { editorViewCtx } from '@milkdown/kit/core'
import { $nodeSchema, $remark } from '@milkdown/utils'

const props = defineProps({
  initialContent: { type: String, default: '' },
  onImageFile: { type: Function, default: null }
})

const videoIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
  <path d="M10 16.5l6-4.5-6-4.5v9zM12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/>
</svg>`

function extractYouTubeId(url) {
  const match = url.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/
  )
  return match?.[1] ?? null
}

// Custom node: renders as an actual iframe in the editor
const youtubeEmbedSchema = $nodeSchema('youtube_embed', () => ({
  inline: false,
  group: 'block',
  selectable: true,
  draggable: true,
  atom: true,
  attrs: {
    videoId: { default: '' },
    src: { default: '' }
  },
  toDOM: (node) => ['div', { class: 'youtube-embed-wrapper', contenteditable: 'false' }, [
    'iframe', {
      class: 'youtube-embed-preview',
      src: node.attrs.src,
      width: '100%',
      height: '400',
      frameborder: '0',
      allow: 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture',
      allowfullscreen: ''
    }
  ]],
  parseDOM: [{
    tag: 'div.youtube-embed-wrapper',
    getAttrs: (dom) => {
      const iframe = dom.querySelector('iframe')
      const src = iframe?.getAttribute('src') || ''
      const videoId = src.split('/embed/')[1]?.split('?')[0] || ''
      return { videoId, src }
    }
  }],
  parseMarkdown: {
    match: (node) => node.type === 'youtube_embed',
    runner: (state, node, type) => {
      state.addNode(type, { videoId: node.alt || '', src: node.url || '' })
    }
  },
  toMarkdown: {
    match: (node) => node.type.name === 'youtube_embed',
    runner: (state, node) => {
      state.openNode('paragraph')
      state.addNode('image', undefined, undefined, {
        url: node.attrs.src,
        alt: node.attrs.videoId,
        title: 'youtube-embed'
      })
      state.closeNode()
    }
  }
}))

// Remark plugin: round-trip serialized YouTube embeds (image with special title)
const remarkYoutubePlugin = $remark('remark-youtube', () => () => (tree) => {
  const children = tree.children
  for (let i = 0; i < children.length; i++) {
    const node = children[i]
    if (node.type !== 'paragraph' || node.children?.length !== 1) continue
    const child = node.children[0]
    if (child.type !== 'image' || child.title !== 'youtube-embed') continue
    children[i] = { type: 'youtube_embed', url: child.url, alt: child.alt }
  }
})

const containerRef = ref(null)
let crepe = null

onMounted(async () => {
  const uploadHandler = async (file) => props.onImageFile?.(file) ?? URL.createObjectURL(file)

  crepe = new Crepe({
    root: containerRef.value,
    defaultValue: props.initialContent,
    featureConfigs: {
      [Crepe.Feature.ImageBlock]: {
        onUpload: uploadHandler,
        blockOnUpload: uploadHandler,
        inlineOnUpload: uploadHandler
      },
      [Crepe.Feature.BlockEdit]: {
        textGroup: { h4: null, h5: null, h6: null },
        advancedGroup: { math: null },
        buildMenu: (builder) => {
          const advanced = builder.getGroup('advanced')
          advanced.addItem('video', {
            label: 'YouTube Video',
            icon: videoIcon,
            onRun: (ctx) => {
              const url = window.prompt('YouTube URL:')
              if (!url) return

              const videoId = extractYouTubeId(url)
              if (!videoId) {
                window.alert('Could not find a YouTube video ID in that URL.')
                return
              }

              const view = ctx.get(editorViewCtx)
              const { state } = view
              const nodeType = youtubeEmbedSchema.type(ctx)
              const embedNode = nodeType.create({
                videoId,
                src: `https://www.youtube.com/embed/${videoId}`
              })

              const { $from } = state.selection
              const blockStart = $from.before($from.depth)
              const blockEnd = $from.after($from.depth)
              view.dispatch(state.tr.replaceRangeWith(blockStart, blockEnd, embedNode))
            }
          })
        }
      }
    }
  })

  crepe.addFeature((editor) => {
    editor.use([...remarkYoutubePlugin, ...youtubeEmbedSchema])
  })

  await crepe.create()
})

onUnmounted(async () => {
  await crepe?.destroy()
  crepe = null
})

defineExpose({
  getContent: () => crepe?.getMarkdown() ?? ''
})
</script>
