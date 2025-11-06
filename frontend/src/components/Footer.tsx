import React from 'react'
import footerImage from '../assets/images/IMG_4027.png'

const Footer: React.FC = () => {
  return (
    <footer className="bg-xah-dark/95 text-white py-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
          <div>
            <h3 className="text-3xl font-extrabold mb-6 uppercase tracking-tight">XAH PAYROLL</h3>
            <p className="text-gray-300 mb-6 uppercase text-sm leading-relaxed tracking-wide">
              DECENTRALIZED HOURLY PAYROLL SYSTEM POWERED BY XAH MICROTRANSACTIONS ON XRPL.
            </p>
            <img 
              src={footerImage} 
              alt="XahPayroll" 
              className="w-48 h-48 mx-auto md:mx-0 object-contain rounded-lg"
            />
          </div>
          
          <div>
            <h4 className="font-bold mb-6 uppercase text-base tracking-wide">CONTACT</h4>
            <ul className="space-y-3 text-gray-300">
              <li>
                <a href="https://twitter.com/xahpayroll" target="_blank" rel="noopener noreferrer" className="hover:text-white uppercase text-sm tracking-wide transition-colors flex items-center gap-2">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                  </svg>
                  TWITTER/X
                </a>
              </li>
              <li>
                <a href="mailto:admin@xahpayroll.xyz" className="hover:text-white uppercase text-sm tracking-wide transition-colors flex items-center gap-2">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
                  </svg>
                  ADMIN@XAHPAYROLL.XYZ
                </a>
              </li>
            </ul>
          </div>
        </div>
        
        <div className="border-t border-gray-600 mt-12 pt-10 text-center text-gray-400">
          <p className="uppercase text-sm tracking-wide">&copy; 2025 XAHPAYROLL. BUILT ON XRP LEDGER (XRPL).</p>
          <p className="uppercase text-sm tracking-wide mt-2">
            ENGINEERED OPEN SOURCE & MAINTAINED BY <a href="https://landing.goodmoneycollective.com" target="_blank" rel="noopener noreferrer" className="text-secondary-500 hover:text-secondary-400 transition-colors font-semibold">GOOD MONEY COLLECTIVE</a>
          </p>
        </div>
      </div>
    </footer>
  )
}

export default Footer
