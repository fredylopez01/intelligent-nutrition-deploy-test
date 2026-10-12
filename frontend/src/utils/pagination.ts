export type PageItem = number | 'gap-start' | 'gap-end'

const MAX_VISIBLE_PAGES = 7

export function getPageItems(page: number, totalPages: number): PageItem[] {
  if (totalPages <= MAX_VISIBLE_PAGES) {
    return Array.from({ length: totalPages }, (_, index) => index + 1)
  }
  const start = Math.min(Math.max(page - 1, 2), totalPages - 4)
  const end = Math.max(Math.min(page + 1, totalPages - 1), 5)
  const items: PageItem[] = [1]
  if (start > 3) items.push('gap-start')
  else if (start === 3) items.push(2)
  for (let current = start; current <= end; current += 1) items.push(current)
  if (end < totalPages - 2) items.push('gap-end')
  else if (end === totalPages - 2) items.push(totalPages - 1)
  items.push(totalPages)
  return items
}
