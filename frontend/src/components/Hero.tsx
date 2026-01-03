import React from 'react'
import { Link } from 'react-router-dom'

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
            
            {/* Badges */}
            <div className="flex flex-wrap gap-4 justify-center items-center">
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
                href="https://github.com/xahpayroll" 
                target="_blank" 
                rel="noopener noreferrer"
                className="inline-flex items-center px-5 py-2.5 bg-xah-blue/10 rounded-full hover:bg-xah-blue/20 transition-colors duration-200"
              >
                <span className="text-xah-blue font-bold text-base uppercase tracking-wide">
                  🔓 OPEN SOURCE
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
