'use client'

import { createClient } from '@/lib/supabase/client'

export const dynamic = 'force-dynamic'

export default function DisabledPage() {
  const supabase = createClient()

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <span className="text-5xl inline-block mb-3">🔒</span>
        <h2 className="text-2xl font-bold text-gray-900 tracking-tight">
          Account Suspended
        </h2>
        <p className="mt-2 text-sm text-gray-600 max-w-sm mx-auto">
          Your account has been deactivated by an administrator. Please contact the site owner if you believe this is in error.
        </p>
      </div>

      <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-md px-4 text-center">
        <button
          onClick={handleSignOut}
          className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-xl shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition-all active:scale-95"
        >
          Sign Out
        </button>
      </div>
    </div>
  )
}
