import React from 'react'
import { Link } from 'react-router-dom'
import XamanLogo from '../assets/xaman-logo.png'

const Hero: React.FC = () => {
  return (
    <section className="pt-32 pb-16 bg-gradient-to-br from-xah-light via-white to-primary-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          {/* Main Heading */}
          <div className="animated-gradient-bg mb-16 max-w-5xl mx-auto mt-16">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold text-xah-blue leading-tight uppercase tracking-tight relative z-10 mb-4">
              XAH PAYROLL
            </h1>
            <p className="text-2xl md:text-3xl lg:text-4xl font-bold text-gray-900 leading-tight uppercase tracking-tight relative z-10 mb-8">
              DECENTRALIZED HOURLY PAYROLL SOLUTION
            </p>

            {/* Revolutionary Insight Box */}
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-xah-blue/30 rounded-lg py-5 px-6 mb-6 mx-auto max-w-3xl relative z-10 shadow-lg">
              <div className="flex items-start gap-3">
                <div className="text-3xl flex-shrink-0">💡</div>
                <div className="text-left">
                  <p className="text-base md:text-lg font-bold text-xah-blue uppercase mb-2 tracking-wide">
                    THE REVOLUTION: NO BANKS. NO DELAYS. NO MIDDLEMEN.
                  </p>
                  <p className="text-sm md:text-base text-gray-700 leading-relaxed mb-3">
                    WORKERS RECEIVE PAYMENT IN <span className="font-bold text-xah-blue">&lt;5 SECONDS</span> FOR <span className="font-bold text-xah-blue">$0.001</span> PER TRANSACTION.
                    YOUR MONEY, YOUR WALLET, YOUR CONTROL. LEDGER-SECURED ESCROW PROTECTS BOTH WORKERS AND EMPLOYERS.
                  </p>
                  <p className="text-sm md:text-base text-gray-700 leading-relaxed mb-3">
                    <span className="font-bold text-xah-blue">COMPLETE DATA INTEGRITY:</span> IMMUTABLE BLOCKCHAIN AUDIT TRAILS + EXPORTABLE PDF RECORDS ENSURE TRANSPARENT, VERIFIABLE PAYMENT HISTORY FOR BOTH ORGANIZATIONS AND EMPLOYEES.
                  </p>
                  <p className="text-sm md:text-base text-gray-700 leading-relaxed">
                    <span className="font-bold text-xah-blue">OUR MISSION:</span> XAH PAYROLL AIMS TO REVOLUTIONIZE PAYROLL SYSTEMS GLOBALLY BY PROVIDING A FOUNDATION FOR XRPL DEVELOPERS TO BUILD UPON - HAPPY CODING!
                  </p>
                </div>
              </div>
            </div>

            {/* Temporary Service Notice */}
            <div className="bg-gradient-to-r from-amber-50 to-orange-50 border-2 border-amber-300 rounded-lg py-4 px-6 mb-8 mx-auto max-w-3xl relative z-10">
              <p className="text-sm md:text-base text-gray-800 leading-relaxed">
                <span className="font-bold text-amber-700 uppercase">⚠️ SERVICE NOTE:</span>{' '}
                THIS INSTANCE WAS LAUNCHED FOR THE{' '}
                <a
                  href="https://xahau.network/contest/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xah-blue font-bold underline hover:text-blue-700 transition-colors"
                >
                  XAHAU DEV CONTEST
                </a>
                 & IS EXTENDED INDEFINITELY AS A PUBLIC SERVICE. VISIT THE{' '}
                <a
                  href="https://github.com/Ghostrayu/xahpayroll"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xah-blue font-bold underline hover:text-blue-700 transition-colors"
                >
                  OPEN SOURCE REPO
                </a>
                {' '}FOR AN INSIDE LOOK OR TO CUSTOMIZE YOUR OWN PRIVATE INSTANCE.
              </p>
            </div>

            {/* Badges */}
            <div className="flex flex-wrap gap-4 justify-center items-center relative z-10">
              <a
                href="https://xahau.network/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center px-5 py-2.5 bg-xah-blue/10 rounded-full hover:bg-xah-blue/20 transition-colors duration-200"
              >
                <span className="text-xah-blue font-bold text-base uppercase tracking-wide">
                  ⚡ POWERED BY XAHAU (XRPL)
                </span>
              </a>

              <a
                href="https://github.com/Ghostrayu/xahpayroll"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center px-5 py-2.5 bg-xah-blue/10 rounded-full hover:bg-xah-blue/20 transition-colors duration-200"
              >
                <span className="text-xah-blue font-bold text-base uppercase tracking-wide">
                  🔓 OPEN SOURCE
                </span>
              </a>

              <a
                href="https://xaman.app/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-xah-blue/10 rounded-full hover:bg-xah-blue/20 transition-colors duration-200"
              >
                <img src={XamanLogo} alt="XAMAN" className="w-6 h-6 object-contain" />
                <span className="text-xah-blue font-bold text-base uppercase tracking-wide">
                  BUILT WITH XAMAN
                </span>
              </a>
            </div>
          </div>

          {/* CTA Buttons */}
          <div id="login-cards" className="flex flex-col sm:flex-row gap-8 justify-center items-stretch mb-20 max-w-6xl mx-auto">
            {/* Worker CTA */}
            <div className="flex flex-col items-center text-center flex-1 bg-white rounded-2xl shadow-2xl p-10 border-2 border-xah-blue/20 hover:border-xah-blue hover:shadow-3xl transition-all duration-300 transform hover:-translate-y-1">
              <div className="mb-8">
                <h3 className="text-xl font-bold text-gray-900 mb-4 uppercase tracking-wide">FOR WORKERS</h3>
                <p className="text-sm text-gray-700 uppercase leading-loose tracking-wide">
                  VIEW YOUR PAYMENT CHANNELS, CLOCK IN AND OUT TO LOG HOURS, RECEIVE PAYMENT WHEN CHANNELS CLOSE
                </p>
              </div>
              <Link to="/worker" className="btn-primary text-base px-10 py-4 uppercase w-full tracking-wide inline-block">
                GET STARTED AS WORKER
              </Link>
            </div>

            {/* Employer CTA */}
            <div className="flex flex-col items-center text-center flex-1 bg-white rounded-2xl shadow-2xl p-10 border-2 border-xah-blue/20 hover:border-xah-blue hover:shadow-3xl transition-all duration-300 transform hover:-translate-y-1">
              <div className="mb-8">
                <h3 className="text-xl font-bold text-gray-900 mb-4 uppercase tracking-wide">FOR NGOS/EMPLOYERS</h3>
                <p className="text-sm text-gray-700 uppercase leading-loose tracking-wide">
                  ADD WORKERS, CREATE PAYMENT CHANNELS WITH XAH ESCROW, MONITOR WORK SESSIONS AND BALANCES
                </p>
              </div>
              <Link to="/ngo" className="btn-secondary text-base px-10 py-4 uppercase w-full tracking-wide inline-block">
                REGISTER AS EMPLOYER
              </Link>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12 max-w-5xl mx-auto mt-20">
            <div className="text-center">
              <div className="text-5xl font-extrabold text-xah-blue mb-3">$0.001</div>
              <div className="text-sm text-gray-700 uppercase tracking-wide font-semibold">TRANSACTION COST</div>
            </div>
            <div className="text-center">
              <div className="text-5xl font-extrabold text-xah-blue mb-3">&lt;5S</div>
              <div className="text-sm text-gray-700 uppercase tracking-wide font-semibold">PAYMENT SETTLEMENT</div>
            </div>
            <div className="text-center">
              <div className="text-5xl font-extrabold text-xah-blue mb-3">24/7</div>
              <div className="text-sm text-gray-700 uppercase tracking-wide font-semibold">AUTOMATED PAYOUTS</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

export default Hero
