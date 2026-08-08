import { defineConfig } from 'vitepress'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  title: "Diablo Immortal Familiars Knowledge Base & Conversion Guide",
  description: "Diablo Immortal Familiars conversion guide brought to you by the PetMasters Discord Community, a place where players can share knowledge and strategies for optimizing their familiars.",
  appearance: 'force-dark',
  cleanUrls: true,
  base: '/petmasters/',

  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/petmasters/skull-symmetric-solo-bone.svg' }],
    ['meta', { name: 'theme-color', content: '#e5ad35' }],
  ],

  themeConfig: {
    logo: '/skull-symmetric-solo-bone.svg',
    siteTitle: 'PetMasters',

    nav: [
      { text: 'Guides', link: '/guides/familiars-classification' },
      { text: 'How to Contribute', link: '/community/contribution-guide' }
    ],

    sidebar: [
      {
        text: '🐾 Getting Started',
        items: [
          { text: 'Familiar Classification', link: '/guides/familiars-classification' },
        ]
      },
      {
        text: '⚡ Mechanics & Breeding',
        items: [
          { text: 'Skills & Attributes Tiers', link: '/guides/skills-and-attributes' },
          { text: 'Conversions & Conversion Stones', link: '/guides/conversion-guide' },
          { text: 'Traits Stacking & Priorities', link: '/guides/traits-guide' },
        ]
      },
      {
        text: '🏛️ Market & NPCs',
        items: [
          { text: 'Nisza NPC Guide', link: '/guides/nisza-npc' },
        ]
      },
      {
        text: '🤝 Community',
        items: [
          { text: 'Contribution Guidelines', link: '/community/contribution-guide' },
        ]
      }
    ],

    search: {
      provider: 'local'
    },

    socialLinks: [
      { icon: 'discord', link: 'https://discord.gg/FKxn3HVW3d' }
    ],

    footer: {
      copyright: 'Created by PetMasters Discord Community'
    }
  },

  transformPageData(pageData) {
    const mdPath = resolve(__dirname, '..', pageData.relativePath)
    try {
      ; (pageData as any).rawMarkdown = readFileSync(mdPath, 'utf-8')
    } catch {
      ; (pageData as any).rawMarkdown = ''
    }
  }
})
