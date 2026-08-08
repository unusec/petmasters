<template>
  <div class="in-site-editor-container">
    <button class="in-site-editor-trigger" @click="openEditor">
      ✏️ Edit / Suggest Change directly on site
    </button>

    <Teleport to="body">
      <div v-if="isOpen" class="editor-fullscreen">

        <div class="editor-topbar">
          <span class="editor-topbar-title">✏️ Suggest Edit — {{ pageTitle }}</span>
          <button class="editor-close-btn" @click="closeEditor" title="Close (Esc)">&times;</button>
        </div>

        <div class="editor-fullscreen-body">
          <p class="editor-hint">
            Edit the content below. Drag and drop images directly into the editor — they'll be included in the pull
            request.
            Your changes go to the Discord moderation queue before going live.
          </p>
          <MilkdownEditor ref="milkdownRef" :initial-content="rawContent" :on-image-file="handleImageFile" />
        </div>

        <div class="editor-fullscreen-footer">
          <div class="editor-meta-row">
            <input v-model="author" type="text" placeholder="Your Name / Discord Handle" />
            <input v-model="summary" type="text" placeholder="Brief Description of Change" />
          </div>
          <div class="editor-footer-actions">
            <div v-if="submitted" class="editor-success">
              🎉 <strong>Thank you!</strong> Submitted for review!
            </div>
            <button class="editor-submit-btn" :disabled="submitting" @click="submitEdit">
              <span v-if="submitting" class="editor-spinner" aria-hidden="true"></span>
              {{ submitting ? 'Submitting…' : 'Submit for Review' }}
            </button>
          </div>
        </div>

      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, defineAsyncComponent } from 'vue'
import { useData } from 'vitepress'

// Async import keeps Milkdown out of the SSR bundle and code-splits it
const MilkdownEditor = defineAsyncComponent(() => import('./MilkdownEditor.vue'))

const { page } = useData()

const isOpen = ref(false)
const submitting = ref(false)
const submitted = ref(false)
const rawContent = ref('')

const author = ref('')
const summary = ref('')
const milkdownRef = ref(null)
const pendingImages = new Map() // blobUrl → File

const pageTitle = computed(() => page.value.title || page.value.relativePath)

onMounted(() => {
  author.value = localStorage.getItem('editor_author') ?? ''
})

watch(author, v => localStorage.setItem('editor_author', v))

function handleImageFile(file) {
  const url = URL.createObjectURL(file)
  pendingImages.set(url, file)
  return url
}

function onKeydown(e) {
  if (e.key === 'Escape') closeEditor()
}

function openEditor() {
  submitted.value = false
  pendingImages.clear()
  rawContent.value = page.value.rawMarkdown || fallback()
  isOpen.value = true
  document.body.style.overflow = 'hidden'
  window.addEventListener('keydown', onKeydown)
}

function fallback() {
  return `# ${pageTitle.value}\n\n[Page content could not be loaded. Write your suggested changes here.]`
}

function closeEditor() {
  isOpen.value = false
  submitted.value = false
  pendingImages.clear()
  document.body.style.overflow = ''
  window.removeEventListener('keydown', onKeydown)
}

async function uploadImageToGitHub(headers, api, branch, blobUrl, file) {
  const filename = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
  const path = `docs/public/img/suggestions/${filename}`
  const bytes = await file.arrayBuffer()
  const binary = Array.from(new Uint8Array(bytes), b => String.fromCharCode(b)).join('')
  const encoded = btoa(binary)

  await fetch(`${api}/contents/${path}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ message: `upload suggestion image: ${filename}`, content: encoded, branch })
  })

  return { blobUrl, finalPath: `/petmasters/img/suggestions/${filename}` }
}

async function createGitHubPR(markdownContent) {
  const token = import.meta.env.VITE_GITHUB_TOKEN
  const repo = import.meta.env.VITE_GITHUB_REPO
  if (!token || !repo) return null

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json'
  }
  const api = `https://api.github.com/repos/${repo}`
  const filePath = `docs/${page.value.relativePath}`
  const branch = `suggestion/${Date.now()}`

  const { default_branch } = await fetch(api, { headers }).then(r => r.json())
  const { object: { sha: headSha } } = await fetch(
    `${api}/git/refs/heads/${default_branch}`, { headers }
  ).then(r => r.json())

  const { sha: fileSha } = await fetch(
    `${api}/contents/${filePath}`, { headers }
  ).then(r => r.json())

  await fetch(`${api}/git/refs`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: headSha })
  })

  // Upload any embedded images and rewrite their blob URLs to final paths
  let finalMarkdown = markdownContent
  for (const [blobUrl, file] of pendingImages) {
    const { finalPath } = await uploadImageToGitHub(headers, api, branch, blobUrl, file)
    finalMarkdown = finalMarkdown.replaceAll(blobUrl, finalPath)
  }

  const bytes = new TextEncoder().encode(finalMarkdown)
  const binary = Array.from(bytes, b => String.fromCharCode(b)).join('')
  const encoded = btoa(binary)

  await fetch(`${api}/contents/${filePath}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      message: `suggestion: ${summary.value}`,
      content: encoded,
      sha: fileSha,
      branch
    })
  })

  const { html_url } = await fetch(`${api}/pulls`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      title: `[Wiki Suggestion] ${summary.value}`,
      body: `**Page:** ${pageTitle.value}\n**Suggested by:** ${author.value || 'Anonymous'}\n\n> ${summary.value}`,
      head: branch,
      base: default_branch
    })
  }).then(r => r.json())

  return html_url
}

async function submitEdit() {
  if (!summary.value.trim()) {
    alert('Please provide a brief description of your change!')
    return
  }

  const webhookUrl = import.meta.env.VITE_DISCORD_WEBHOOK_URL
  if (!webhookUrl) {
    alert('Submission is not configured yet. Please contact a moderator on Discord.')
    return
  }

  submitting.value = true
  try {
    const markdownContent = milkdownRef.value?.getContent() ?? rawContent.value

    const prUrl = await createGitHubPR(markdownContent).catch(() => null)

    const fields = [
      { name: '📄 Page', value: pageTitle.value, inline: true },
      { name: '👤 Suggested by', value: author.value || 'Anonymous', inline: true },
      { name: '📋 Change', value: summary.value }
    ]
    if (prUrl) {
      fields.push({ name: '🔗 Pull Request', value: `[Review & Merge on GitHub](${prUrl})` })
    } else {
      fields.push({
        name: '🔧 How to apply',
        value: `Replace \`${page.value.relativePath}\` with the attached file and push to main.`
      })
    }

    const embed = {
      title: '📝 New Edit Suggestion',
      color: 0xe5ad35,
      fields,
      footer: { text: 'PetMasters Wiki — Edit Suggestion' },
      timestamp: new Date().toISOString()
    }

    const filename = page.value.relativePath.replace(/\//g, '_')
    const file = new Blob([markdownContent], { type: 'text/plain' })
    const form = new FormData()
    form.append('payload_json', JSON.stringify({ embeds: [embed] }))
    form.append('files[0]', file, filename)

    const res = await fetch(webhookUrl, { method: 'POST', body: form })
    if (!res.ok) throw new Error(`Discord returned ${res.status}`)

    submitted.value = true
    setTimeout(closeEditor, 2500)
  } catch (err) {
    alert('Failed to submit suggestion. Please try again or contact a moderator.')
    console.error(err)
  } finally {
    submitting.value = false
  }
}
</script>
