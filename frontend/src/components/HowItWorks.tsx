import React from 'react'

interface Step {
  number: number;
  title: string;
  description: string;
  role: 'employer' | 'worker' | 'system';
}

const HowItWorks: React.FC = () => {
  const steps: Step[] = [
    {
      number: 1,
      title: 'NGO/EMPLOYER CREATES PAYMENT CHANNEL',
      description: 'EMPLOYER CREATES ON-CHAIN PAYMENT CHANNEL WITH XAH ESCROW LOCKED ON XAHAU.',
      role: 'employer',
    },
    {
      number: 2,
      title: 'WORKER LOGS HOURS VIA DASHBOARD',
      description: 'WORKER CLOCKS IN/OUT THROUGH WEB INTERFACE. SESSIONS TRACKED OFF-CHAIN FOR PERFORMANCE.',
      role: 'worker',
    },
    {
      number: 3,
      title: 'OFF-CHAIN BALANCE ACCUMULATION',
      description: 'SYSTEM ACCUMULATES WORKER EARNINGS IN DATABASE AFTER EACH SESSION (HOURLY RATE × HOURS WORKED).',
      role: 'system',
    },
    {
      number: 4,
      title: 'WORKER REQUESTS CHANNEL CLOSURE',
      description: 'WORKER SUBMITS CLOSURE REQUEST VIA DASHBOARD. NGO RECEIVES AUTOMATIC NOTIFICATION TO REVIEW AND APPROVE.',
      role: 'worker',
    },
    {
      number: 5,
      title: 'NGO APPROVES AND EXECUTES CLOSURE',
      description: 'NGO REVIEWS REQUEST AND EXECUTES PAYMENTCHANNELCLAIM TRANSACTION. SETTLEDELAY PROTECTS WORKER DURING TRANSITION.',
      role: 'employer',
    },
    {
      number: 6,
      title: 'ON-CHAIN PAYMENT TO WORKER',
      description: 'ACCUMULATED BALANCE PAID TO WORKER VIA XRPL TRANSACTION. UNUSED ESCROW RETURNS TO NGO AUTOMATICALLY.',
      role: 'worker',
    },
    {
      number: 7,
      title: 'LEDGER VERIFICATION & DATABASE SYNC',
      description: 'SYSTEM VERIFIES TRANSACTION ON XAHAU. NETWORK-AWARE EXPLORER LINKS ENABLE TRANSPARENT VERIFICATION.',
      role: 'system',
    },
    {
      number: 8,
      title: 'EXPORT PDF AUDIT RECORDS',
      description: 'WORKERS AND NGOS EXPORT COMPLETE PAYMENT HISTORY, WORK SESSIONS, AND CHANNEL DETAILS AS PDF REPORTS FOR PERMANENT RECORD-KEEPING AND COMPLIANCE.',
      role: 'system',
    },
  ]

  const getRoleColor = (role: Step['role']): string => {
    switch (role) {
      case 'employer':
        return 'bg-purple-100 text-purple-700'
      case 'worker':
        return 'bg-primary-100 text-primary-700'
      case 'system':
        return 'bg-primary-200 text-primary-800'
    }
  }

  return (
    <section id="how-it-works" className="py-24 bg-transparent">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center mb-20">
          <div className="inline-block bg-xah-blue px-12 py-6 rounded-2xl shadow-2xl mb-8 border-4 border-secondary-500">
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-extrabold text-secondary-500 mb-0 uppercase tracking-tight">
              HOW IT WORKS
            </h2>
          </div>
          <p className="text-base text-gray-700 max-w-3xl mx-auto uppercase leading-relaxed tracking-wide font-semibold">
            OFF-CHAIN BALANCE ACCUMULATION + ON-CHAIN PAYMENT CHANNEL CLOSURE WITH WORKER PROTECTION VIA SETTLEDELAY
          </p>
        </div>

        {/* Timeline */}
        <div className="relative">
          {/* Vertical Line */}
          <div className="hidden md:block absolute left-1/2 transform -translate-x-1/2 h-full w-1 bg-xah-blue/30"></div>

          {/* Steps */}
          <div className="space-y-16">
            {steps.map((step, index) => (
              <div
                key={step.number}
                className={`relative flex items-center ${
                  index % 2 === 0 ? 'md:flex-row' : 'md:flex-row-reverse'
                }`}
              >
                {/* Content */}
                <div className={`w-full md:w-5/12 ${index % 2 === 0 ? 'md:text-right md:pr-12' : 'md:text-left md:pl-12'}`}>
                  <div className="bg-white rounded-2xl shadow-xl p-8 border-2 border-xah-blue/30 hover:border-xah-blue hover:shadow-2xl transition-all duration-300">
                    <div className={`inline-block px-4 py-2 rounded-full text-xs font-bold mb-4 uppercase tracking-wide ${getRoleColor(step.role)}`}>
                      {step.role.toUpperCase()}
                    </div>
                    <h3 className="text-lg font-bold text-gray-900 mb-3 uppercase tracking-wide">
                      {step.title}
                    </h3>
                    <p className="text-sm text-gray-700 uppercase leading-loose tracking-wide">
                      {step.description}
                    </p>
                  </div>
                </div>

                {/* Number Circle */}
                <div className="hidden md:flex absolute left-1/2 transform -translate-x-1/2 w-16 h-16 bg-xah-blue rounded-full items-center justify-center z-10 shadow-2xl border-4 border-white">
                  <span className="text-white font-extrabold text-2xl">{step.number}</span>
                </div>

                {/* Mobile Number */}
                <div className="md:hidden absolute -left-6 w-10 h-10 bg-xah-blue rounded-full flex items-center justify-center shadow-lg">
                  <span className="text-white font-bold text-base">{step.number}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

export default HowItWorks
