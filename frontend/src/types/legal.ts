export type LegalBlock = string | string[]

export interface LegalSection {
  id: string
  title: string
  blocks: LegalBlock[]
}

export interface LegalDocument {
  title: string
  summary: string
  updatedAt: string
  sections: LegalSection[]
}
