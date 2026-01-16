import React from 'react'

const WorkerWorkflow: React.FC = () => {
  const steps = [
    {
      number: 1,
      title: 'CONNECT YOUR WALLET',
      description: 'CONNECT YOUR XAH WALLET (XUMM OR CROSSMARK) TO THE PLATFORM SECURELY',
      icon: '🔗'
    },
    {
      number: 2,
      title: 'CREATE WORKER PROFILE',
      description: 'SET UP YOUR WORKER ACCOUNT WITH YOUR WALLET ADDRESS AND BASIC INFORMATION',
      icon: '👤'
    },
    {
      number: 3,
      title: 'GET ADDED BY EMPLOYER',
      description: 'YOUR NGO/EMPLOYER ADDS YOU TO THEIR SYSTEM AND SETS YOUR HOURLY RATE',
      icon: '✅'
    },
    {
      number: 4,
      title: 'CLOCK IN TO START SHIFT',
      description: 'CLICK "START SHIFT" BUTTON TO BEGIN LOGGING YOUR WORK HOURS',
      icon: '⏰'
    },
    {
      number: 5,
      title: 'WORK & TRACK HOURS',
      description: 'YOUR HOURS ARE AUTOMATICALLY TRACKED AND VERIFIED BY PAYMENT CHANNEL HOOKS',
      icon: '⏱️'
    },
    {
      number: 6,
      title: 'EARNINGS ACCUMULATE',
      description: 'YOUR EARNINGS ACCUMULATE IN THE DATABASE AS YOU WORK - NO HOURLY TRANSACTIONS',
      icon: '💰'
    },
    {
      number: 7,
      title: 'MONITOR YOUR EARNINGS',
      description: 'VIEW REAL-TIME PAYMENT HISTORY, CURRENT SESSION, AND TOTAL EARNINGS ON YOUR DASHBOARD',
      icon: '📊'
    },
    {
      number: 8,
      title: 'REQUEST CHANNEL CLOSURE',
      description: 'SUBMIT CLOSURE REQUEST VIA DASHBOARD. NGO RECEIVES NOTIFICATION AND APPROVES TO RELEASE YOUR ACCUMULATED EARNINGS.',
      icon: '📝'
    },
    {
      number: 9,
      title: 'RECEIVE FINAL PAYMENT',
      description: 'NGO EXECUTES CLOSURE TRANSACTION. YOU RECEIVE ALL ACCUMULATED EARNINGS IN A SINGLE ON-CHAIN PAYMENT.',
      icon: '💰'
    }
  ]

  return (
    <section id="worker-workflow" className="py-24 bg-transparent">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center mb-20">
          <div className="inline-block bg-xah-blue px-12 py-6 rounded-2xl shadow-2xl mb-8 border-4 border-secondary-500">
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-extrabold text-secondary-500 mb-0 uppercase tracking-tight">
              EMPLOYEE WORKFLOW
            </h2>
          </div>
          <p className="text-base text-gray-700 max-w-3xl mx-auto uppercase leading-relaxed tracking-wide font-semibold">
            COMPLETE STEP-BY-STEP PROCESS FOR EMPLOYEES TO LOG HOURS, REQUEST CLOSURE, AND RECEIVE PAYMENT
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
            KEY BENEFITS FOR EMPLOYEES
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="text-4xl mb-4">⚡</div>
              <h4 className="font-bold text-gray-900 mb-2 uppercase text-sm tracking-wide">SINGLE TRANSACTION SETTLEMENT</h4>
              <p className="text-xs text-gray-700 uppercase tracking-wide leading-relaxed">
                REQUEST CLOSURE VIA DASHBOARD - RECEIVE ALL ACCUMULATED EARNINGS IN ONE TRANSACTION AFTER NGO APPROVAL
              </p>
            </div>
            <div className="text-center">
              <div className="text-4xl mb-4">🔒</div>
              <h4 className="font-bold text-gray-900 mb-2 uppercase text-sm tracking-wide">NON-CUSTODIAL</h4>
              <p className="text-xs text-gray-700 uppercase tracking-wide leading-relaxed">
                YOU CONTROL YOUR WALLET AND PRIVATE KEYS - PAYMENTS GO DIRECTLY TO YOU
              </p>
            </div>
            <div className="text-center">
              <div className="text-4xl mb-4">📱</div>
              <h4 className="font-bold text-gray-900 mb-2 uppercase text-sm tracking-wide">SIMPLE & EASY</h4>
              <p className="text-xs text-gray-700 uppercase tracking-wide leading-relaxed">
                JUST CLOCK IN, WORK, AND GET PAID - NO COMPLEX SETUP OR PAPERWORK REQUIRED
              </p>
            </div>
          </div>
        </div>

        {/* Payment Example */}
        <div className="mt-12 bg-gradient-to-br from-xah-blue/10 to-primary-100/20 rounded-2xl shadow-xl p-10 border-2 border-xah-blue/30">
          <h3 className="text-2xl font-extrabold text-gray-900 mb-8 uppercase tracking-tight text-center">
            PAYMENT EXAMPLE
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center">
            <div>
              <div className="text-sm text-gray-700 uppercase tracking-wide font-semibold mb-2">HOURLY RATE</div>
              <div className="text-4xl font-extrabold text-xah-blue mb-2">10 XAH</div>
              <div className="text-xs text-gray-600 uppercase tracking-wide">PER HOUR</div>
            </div>
            <div>
              <div className="text-sm text-gray-700 uppercase tracking-wide font-semibold mb-2">HOURS WORKED</div>
              <div className="text-4xl font-extrabold text-xah-blue mb-2">8 HRS</div>
              <div className="text-xs text-gray-600 uppercase tracking-wide">IN ONE DAY</div>
            </div>
            <div>
              <div className="text-sm text-gray-700 uppercase tracking-wide font-semibold mb-2">TOTAL EARNED</div>
              <div className="text-4xl font-extrabold text-xah-blue mb-2">80 XAH</div>
              <div className="text-xs text-gray-600 uppercase tracking-wide">PAID AFTER CLOSURE REQUEST APPROVED</div>
            </div>
          </div>
          <div className="mt-8 text-center">
            <p className="text-xs text-gray-700 uppercase tracking-wide leading-relaxed">
              💡 EARNINGS ACCUMULATE OFF-CHAIN - SUBMIT CLOSURE REQUEST - NGO APPROVES - RECEIVE ALL FUNDS IN SINGLE TRANSACTION
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}

export default WorkerWorkflow
