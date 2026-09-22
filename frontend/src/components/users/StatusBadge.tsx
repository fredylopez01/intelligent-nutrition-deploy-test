import type { UserStatus } from '../../types/user'
import { USER_STATUS_LABELS } from '../../utils/users'

import './StatusBadge.css'

interface StatusBadgeProps {
  status: UserStatus
}

export function StatusBadge({ status }: StatusBadgeProps) {
  return <span className={`ui-status ui-status--${status}`}>{USER_STATUS_LABELS[status]}</span>
}
