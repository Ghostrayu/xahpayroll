import React from 'react'
import { Link } from 'react-router-dom'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'

const TermsOfService: React.FC = () => {
  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-primary-50 via-white to-secondary-50">
      <Navbar />
      
      <main className="flex-grow container mx-auto px-4 py-12 max-w-4xl">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-extrabold text-gray-900 uppercase tracking-tight mb-4">
            Terms of Service
          </h1>
          <p className="text-gray-600 uppercase text-sm tracking-wide">
            Last Updated: November 7, 2025
          </p>
        </div>

        {/* Content */}
        <div className="bg-white rounded-2xl shadow-xl p-8 md:p-12 border-4 border-xah-blue/20">
          <div className="prose prose-sm md:prose-base max-w-none">
            
            <section className="mb-8">
              <h2 className="text-2xl font-bold text-gray-900 uppercase mb-4">1. Acceptance of Terms</h2>
              <p className="text-gray-700 leading-relaxed">
                By accessing and using XAH Payroll ("the Service"), you accept and agree to be bound by the terms and provision of this agreement. If you do not agree to these Terms of Service, please do not use the Service.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-bold text-gray-900 uppercase mb-4">2. Description of Service</h2>
              <p className="text-gray-700 leading-relaxed mb-4">
                XAH Payroll is a decentralized payroll management system that enables hourly wage payments through XAH microtransactions on the XRP Ledger (XRPL). The Service facilitates:
              </p>
              <ul className="list-disc list-inside text-gray-700 space-y-2 ml-4">
                <li>Automated hourly payroll distribution</li>
                <li>Payment channel management</li>
                <li>Escrow fund handling</li>
                <li>Worker time tracking</li>
                <li>NGO/Employer payment administration</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-bold text-gray-900 uppercase mb-4">3. User Accounts and Wallet Connection</h2>
              
              <h3 className="text-xl font-semibold text-gray-800 uppercase mb-3 mt-6">3.1 Wallet Requirements</h3>
              <ul className="list-disc list-inside text-gray-700 space-y-2 ml-4">
                <li>Users must connect a compatible XRPL wallet (Xaman)</li>
                <li>Users are solely responsible for maintaining the security of their wallet and private keys</li>
                <li>XAH Payroll is a non-custodial service and does not store or have access to your private keys</li>
              </ul>

              <h3 className="text-xl font-semibold text-gray-800 uppercase mb-3 mt-6">3.2 Account Information</h3>
              <ul className="list-disc list-inside text-gray-700 space-y-2 ml-4">
                <li>You agree to provide accurate, current, and complete information during registration</li>
                <li>You are responsible for maintaining and updating your account information</li>
                <li>You must not impersonate any person or entity or misrepresent your affiliation</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-bold text-gray-900 uppercase mb-4">4. Financial Transactions</h2>
              
              <h3 className="text-xl font-semibold text-gray-800 uppercase mb-3 mt-6">4.1 Payments</h3>
              <ul className="list-disc list-inside text-gray-700 space-y-2 ml-4">
                <li>All payments are processed on the XRP Ledger blockchain</li>
                <li><strong>Transactions are irreversible once confirmed on the blockchain</strong></li>
                <li>XAH Payroll does not control, reverse, or refund blockchain transactions</li>
              </ul>

              <h3 className="text-xl font-semibold text-gray-800 uppercase mb-3 mt-6">4.2 Fees</h3>
              <ul className="list-disc list-inside text-gray-700 space-y-2 ml-4">
                <li>Network transaction fees (gas fees) apply to all blockchain transactions</li>
                <li>Users are responsible for all network fees associated with their transactions</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-bold text-gray-900 uppercase mb-4">5. User Responsibilities</h2>
              
              <h3 className="text-xl font-semibold text-gray-800 uppercase mb-3 mt-6">5.1 Prohibited Activities</h3>
              <p className="text-gray-700 mb-3">You agree NOT to:</p>
              <ul className="list-disc list-inside text-gray-700 space-y-2 ml-4">
                <li>Use the Service for any illegal or unauthorized purpose</li>
                <li>Attempt to gain unauthorized access to the Service or other users' accounts</li>
                <li>Engage in fraudulent time reporting or payment manipulation</li>
                <li>Violate any applicable laws or regulations</li>
              </ul>

              <h3 className="text-xl font-semibold text-gray-800 uppercase mb-3 mt-6">5.2 Time Tracking (Workers)</h3>
              <ul className="list-disc list-inside text-gray-700 space-y-2 ml-4">
                <li>Workers must accurately report hours worked</li>
                <li>False reporting may result in account termination and legal action</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-bold text-gray-900 uppercase mb-4">6. Privacy and Data Security</h2>
              <ul className="list-disc list-inside text-gray-700 space-y-2 ml-4">
                <li>We collect wallet addresses, profile information, and transaction data</li>
                <li>Blockchain transactions are public and permanently recorded</li>
                <li>You are responsible for maintaining the confidentiality of your wallet credentials</li>
              </ul>
            </section>

            <section className="mb-8 bg-yellow-50 border-2 border-yellow-200 rounded-lg p-6">
              <h2 className="text-2xl font-bold text-gray-900 uppercase mb-4">7. Disclaimers and Limitations</h2>
              
              <h3 className="text-xl font-semibold text-gray-800 uppercase mb-3">"AS IS" Service</h3>
              <p className="text-gray-700 mb-4">
                <strong>THE SERVICE IS PROVIDED "AS IS" WITHOUT WARRANTIES OF ANY KIND.</strong> We do not guarantee the Service will be uninterrupted, secure, or error-free.
              </p>

              <h3 className="text-xl font-semibold text-gray-800 uppercase mb-3">Blockchain Risks</h3>
              <p className="text-gray-700 mb-3">Blockchain technology involves inherent risks including:</p>
              <ul className="list-disc list-inside text-gray-700 space-y-2 ml-4">
                <li>Price volatility of XAH and other cryptocurrencies</li>
                <li>Network congestion and transaction delays</li>
                <li>Smart contract vulnerabilities</li>
                <li>Regulatory uncertainty</li>
              </ul>
              <p className="text-gray-700 mt-4">
                <strong>You acknowledge and accept these risks.</strong>
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-bold text-gray-900 uppercase mb-4">8. Termination</h2>
              <p className="text-gray-700 mb-4">
                We may terminate or suspend your access immediately, without prior notice, for violation of these Terms, fraudulent activity, or at our sole discretion.
              </p>
              <p className="text-gray-700">
                Upon termination, your right to use the Service ceases immediately. Blockchain transactions already initiated cannot be reversed.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-bold text-gray-900 uppercase mb-4">9. Changes to Terms</h2>
              <p className="text-gray-700">
                We reserve the right to modify these Terms at any time. Changes will be effective immediately upon posting. Continued use of the Service constitutes acceptance of modified Terms.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-bold text-gray-900 uppercase mb-4">10. Contact Information</h2>
              <p className="text-gray-700">
                For questions about these Terms of Service, please contact:
              </p>
              <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                <p className="text-gray-800 font-semibold">Good Money Collective</p>
                <p className="text-gray-700">Email: admin@xahpayroll.xyz</p>
                <p className="text-gray-700">Website: https://xahpayroll.xyz</p>
              </div>
            </section>

            <div className="mt-12 p-6 bg-xah-blue/10 border-2 border-xah-blue rounded-lg">
              <p className="text-center text-gray-800 font-bold uppercase">
                By using XAH Payroll, you acknowledge that you have read, understood, and agree to be bound by these Terms of Service.
              </p>
            </div>
          </div>
        </div>

        {/* Back Button */}
        <div className="mt-8 text-center">
          <Link
            to="/"
            className="inline-block bg-gradient-to-r from-xah-blue to-primary-700 text-white px-8 py-3 rounded-lg font-bold uppercase text-sm hover:shadow-lg transition-all duration-200 hover:scale-105"
          >
            ← Back to Home
          </Link>
        </div>
      </main>

      <Footer />
    </div>
  )
}

export default TermsOfService
