import React from 'react'
import type { Feature } from '../types'

const Features: React.FC = () => {
  const features: Feature[] = [
    {
      icon: '🕐',
      title: 'OFF-CHAIN BALANCE ACCUMULATION',
      description: 'WORKER EARNINGS ACCUMULATE IN DATABASE AFTER EACH WORK SESSION. PAID VIA SINGLE EFFICIENT TRANSACTION WHEN PAYMENT CHANNEL CLOSES.',
    },
    {
      icon: '🔐',
      title: 'PAYMENT CHANNEL HOOKS',
      description: 'HOOKS VERIFY SIGNATURES AND ENFORCE PAYMENT RULES ON-CHAIN.',
    },
    {
      icon: '💰',
      title: 'ON-CHAIN PAYMENT CHANNEL ESCROW',
      description: 'EMPLOYER FUNDS LOCKED IN XAHAU PAYMENT CHANNELS. WORKER RECEIVES ACCUMULATED BALANCE ON CLOSURE, UNUSED ESCROW RETURNS TO NGO AUTOMATICALLY.',
    },
    {
      icon: '⏱️',
      title: 'SETTLEDELAY WORKER PROTECTION',
      description: 'CONFIGURABLE 1-72 HOUR PROTECTION PERIOD DURING CHANNEL CLOSURE. WORKERS HAVE TIME TO VERIFY PAYMENT BEFORE FINAL SETTLEMENT.',
    },
    {
      icon: '📊',
      title: 'REAL-TIME TRACKING',
      description: 'OFF-CHAIN SESSION TRACKING WITH LIVE MONITORING. ON-CHAIN PAYMENT VERIFICATION AND ESCROW BALANCE QUERIES.',
    },
    {
      icon: '🔒',
      title: 'NON-CUSTODIAL WALLET SECURITY',
      description: 'WALLET-BASED AUTHENTICATION VIA XAMAN. USERS MAINTAIN FULL CONTROL OF PRIVATE KEYS. ALL TRANSACTIONS SIGNED CLIENT-SIDE.',
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
            HYBRID ARCHITECTURE: ON-CHAIN PAYMENT CHANNELS & ESCROW + OFF-CHAIN BALANCE ACCUMULATION + NETWORK-AWARE LEDGER VERIFICATION
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
