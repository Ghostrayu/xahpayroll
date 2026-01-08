import React from 'react'

const ProductionBanner: React.FC = () => {
  return (
    <div className="bg-gradient-to-r from-xah-blue to-blue-600 text-white py-3 px-4 shadow-lg">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-center gap-3">
          <div className="flex items-center gap-2">
            <div className="animate-pulse">
              <div className="h-3 w-3 bg-green-400 rounded-full shadow-lg shadow-green-400/50"></div>
            </div>
            <span className="font-bold text-lg tracking-wider uppercase">
              CURRENTLY IN PRODUCTION
            </span>
          </div>
          <span className="hidden sm:inline text-white/80">•</span>
          <span className="font-semibold tracking-wide uppercase text-sm sm:text-base">
            LIVE DEPLOY FEB 2026
          </span>
        </div>
      </div>
    </div>
  )
}

export default ProductionBanner
