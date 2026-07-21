import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { SitePageViewer } from '@/app/p/[slug]/site-page-viewer'

export const revalidate = 60 // Revalidate cache every 60 seconds

interface PageProps {
  params: { slug: string }
}

export default async function DynamicPage({ params }: PageProps) {
  const { slug } = await params
  const supabase = await createClient()
  const { data: page, error } = await supabase
    .from('site_pages')
    .select('*')
    .eq('slug', slug)
    .maybeSingle()

  if (error) {
    console.error('Error fetching site_pages:', error)
  }

  if (!page) {
    notFound()
  }

  return <SitePageViewer page={page} />
}
