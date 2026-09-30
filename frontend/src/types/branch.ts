export interface Branch {
  id: string
  name: string
  address: string
  phone: string
  active: boolean
}

export interface CreateBranchPayload {
  name: string
  address: string
  phone: string
}
