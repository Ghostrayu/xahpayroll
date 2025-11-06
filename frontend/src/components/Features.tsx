import React from 'react'
import type { Feature } from '../types'

const Features: React.FC = () => {
  const features: Feature[] = [
    {
      icon: '🕐',
      title: 'HOURLY PAYMENT DISTRIBUTION',
      description: 'WORKERS RECEIVE XAH PAYMENTS AUTOMATICALLY EVERY HOUR BASED ON LOGGED WORK TIME WITH MICROTRANSACTION EFFICIENCY.',
    },
    {
      icon: '🔐',
      title: 'PAYMENT CHANNEL HOOKS',
      description: 'HOOKS VERIFY SIGNATURES AND ENFORCE PAYMENT RULES ON-CHAIN.',
    },
    {
      icon: '💰',
      title: 'ESCROW MANAGEMENT',
      description: 'ON-CHAIN ESCROW HOLDS EMPLOYER FUNDS SECURELY. AUTOMATED RELEASE WHEN PAYMENT CONDITIONS VERIFIED BY HOOKS.',
    },
    {
      icon: '⏱️',
      title: 'AUTOMATED TIMEOUT SYSTEM',
      description: 'AUTOMATIC TIMEOUT DETECTION WHEN WORKERS STOP LOGGING HOURS WITH CONFIGURABLE GRACE PERIODS.',
    },
    {
      icon: '📊',
      title: 'REAL-TIME TRACKING',
      description: 'OFF-CHAIN SESSION TRACKING WITH LIVE MONITORING. ON-CHAIN PAYMENT VERIFICATION AND ESCROW BALANCE QUERIES.',
    },
    {
      icon: '🔒',
      title: 'NON-CUSTODIAL SECURITY',
      description: 'DELEGATED KEYS ENCRYPTED ON SERVER WITH LIMITED SCOPE. EMPLOYER RETAINS MASTER KEY AND CAN REVOKE ACCESS ANYTIME.',
    },
  ]

  return (
    <section id="features" className="py-24 bg-transparent">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center mb-20">
          <div className="inline-block bg-xah-blue px-12 py-6 rounded-2xl shadow-2xl mb-8 border-4 border-secondary-500">
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-extrabold text-secondary-500 mb-0 uppercase tracking-tight">
              CORE FEATURES
            </h2>
          </div>
          <p className="text-base text-gray-700 max-w-3xl mx-auto uppercase leading-relaxed tracking-wide font-semibold">
            HYBRID ARCHITECTURE: ON-CHAIN PAYMENTS & ESCROW + OFF-CHAIN SESSION TRACKING FOR OPTIMAL PERFORMANCE
          </p>
        </div>

        {/* Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature, index) => (
            <div key={index} className="bg-white rounded-2xl shadow-xl p-8 border-2 border-xah-blue/30 hover:border-secondary-500 hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-2">
              <div className="text-6xl mb-6">{feature.icon}</div>
              <h3 className="text-lg font-bold text-xah-blue mb-4 uppercase tracking-wide">
                {feature.title}
              </h3>
              <p className="text-sm text-gray-700 leading-loose uppercase tracking-wide">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

export default Features
