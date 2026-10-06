import type { DocumentType } from '../types/supplier'

import { http } from './http'

export const documentTypesService = {
  list: (token: string | null): Promise<DocumentType[]> =>
    http.get<DocumentType[]>('/document-types', { token }),
}
