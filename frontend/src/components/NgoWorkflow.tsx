import React from 'react'

const NgoWorkflow: React.FC = () => {
  const steps = [
    {
      number: 1,
      title: 'CREATE NGO ACCOUNT',
      description: 'REGISTER YOUR ORGANIZATION AND CONNECT YOUR XAH WALLET TO THE PLATFORM',
      icon: '📝'
    },
    {
      number: 2,
      title: 'ADD WORKERS TO SYSTEM',
      description: 'ONBOARD WORKERS BY ADDING THEIR WALLET ADDRESSES AND SETTING HOURLY RATES',
      icon: '👥'
    },
    {
      number: 3,
      title: 'FUND ESCROW WALLET',
      description: 'DEPOSIT XAH TOKENS INTO THE SECURE ESCROW ACCOUNT TO COVER WORKER PAYMENTS',
      icon: '💰'
    },
    {
      number: 4,
      title: 'CONFIGURE PAYMENT RULES',
      description: 'SET HOURLY RATES, TIMEOUT THRESHOLDS, AND PAYMENT CHANNEL PARAMETERS',
      icon: '⚙️'
    },
    {
      number: 5,
      title: 'MONITOR REAL-TIME ACTIVITY',
      description: 'TRACK WORKER HOURS, ACTIVE SESSIONS, PAYMENT HISTORY, ESCROW BALANCE, AND PERFORMANCE METRICS',
      icon: '📊'
    },
    {
      number: 6,
      title: 'AUTOMATIC VERIFIED PAYOUTS',
      description: 'SYSTEM RELEASES PAYMENTS EVERY HOUR FROM ESCROW WITH CRYPTOGRAPHIC VERIFICATION VIA PAYMENT CHANNEL HOOKS',
      icon: '⚡'
    }
  ]

  return (
    <section id="ngo-workflow" className="py-24 bg-transparent">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center mb-20">
          <div className="inline-block bg-xah-blue px-12 py-6 rounded-2xl shadow-2xl mb-8 border-4 border-secondary-500">
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-extrabold text-secondary-500 mb-0 uppercase tracking-tight">
              NGO WORKFLOW
            </h2>
          </div>
          <p className="text-base text-gray-700 max-w-3xl mx-auto uppercase leading-relaxed tracking-wide font-semibold">
            COMPLETE STEP-BY-STEP PROCESS FOR NGOS AND EMPLOYERS TO MANAGE DECENTRALIZED PAYROLL
          </p>
        </div>

        {/* Workflow Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {steps.map((step) => (
            <div 
              key={step.number} 
              className="bg-white rounded-2xl shadow-xl p-6 border-2 border-xah-blue/30 hover:border-xah-blue hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-2"
            >
              {/* Step Number */}
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 bg-xah-blue rounded-full flex items-center justify-center shadow-lg">
                  <span className="text-white font-extrabold text-xl">{step.number}</span>
                </div>
                <div className="text-5xl">{step.icon}</div>
              </div>

              {/* Step Content */}
              <h3 className="text-base font-bold text-gray-900 mb-3 uppercase tracking-wide">
                {step.title}
              </h3>
              <p className="text-xs text-gray-700 uppercase leading-relaxed tracking-wide">
                {step.description}
              </p>
            </div>
          ))}
        </div>

        {/* Key Benefits */}
        <div className="mt-16 bg-white rounded-2xl shadow-xl p-10 border-2 border-xah-blue/30">
          <h3 className="text-2xl font-extrabold text-gray-900 mb-8 uppercase tracking-tight text-center">
            KEY BENEFITS FOR NGOS
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="text-4xl mb-4">🎯</div>
              <h4 className="font-bold text-gray-900 mb-2 uppercase text-sm tracking-wide">TRANSPARENCY</h4>
              <p className="text-xs text-gray-700 uppercase tracking-wide leading-relaxed">
                COMPLETE VISIBILITY INTO ALL PAYMENTS AND WORKER ACTIVITY ON-CHAIN
              </p>
            </div>
            <div className="text-center">
              <div className="text-4xl mb-4">💸</div>
              <h4 className="font-bold text-gray-900 mb-2 uppercase text-sm tracking-wide">LOW COST</h4>
              <p className="text-xs text-gray-700 uppercase tracking-wide leading-relaxed">
                MINIMAL TRANSACTION FEES ($0.001) COMPARED TO TRADITIONAL PAYROLL SYSTEMS
              </p>
            </div>
            <div className="text-center">
              <div className="text-4xl mb-4">🔒</div>
              <h4 className="font-bold text-gray-900 mb-2 uppercase text-sm tracking-wide">SECURITY</h4>
              <p className="text-xs text-gray-700 uppercase tracking-wide leading-relaxed">
                FUNDS SECURED IN ESCROW WITH CRYPTOGRAPHIC VERIFICATION AND AUDIT TRAILS
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

export default NgoWorkflow
