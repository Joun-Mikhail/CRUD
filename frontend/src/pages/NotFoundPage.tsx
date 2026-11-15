import { Compass } from 'lucide-react'
import { Link } from 'react-router'
import { buttonClasses } from '../components/ui/buttonStyles'
import { EmptyState } from '../components/ui/EmptyState'
import { useDocumentTitle } from '../hooks/useDocumentTitle'

export function NotFoundPage() {
  useDocumentTitle('Page not found')
  return (
    <EmptyState
      icon={<Compass aria-hidden="true" className="size-5" />}
      title="Page not found"
      description="There is nothing at this address."
      action={
        <Link to="/" className={buttonClasses('primary')}>
          Back to dashboard
        </Link>
      }
    />
  )
}
