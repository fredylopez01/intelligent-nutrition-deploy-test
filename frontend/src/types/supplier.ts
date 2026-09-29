export interface DocumentType {
  id: string
  code: string
  name: string
  active: boolean
}

export interface SupplierPerson {
  id: string
  businessName: string
  documentNumber: string
  email: string
  phone: string
}

export interface Supplier {
  id: string
  person: SupplierPerson
  commercialName: string
}

export interface CreateSupplierPayload {
  person: {
    documentTypeId: string
    documentNumber: string
    businessName: string
    email: string
    phone: string
    address?: string
  }
  commercialName: string
}
