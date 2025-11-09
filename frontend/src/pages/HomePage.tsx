import React from 'react'
import Navbar from '../components/Navbar'
import Hero from '../components/Hero'
import Features from '../components/Features'
import HowItWorks from '../components/HowItWorks'
import Footer from '../components/Footer'
import BackToTop from '../components/BackToTop'

const HomePage: React.FC = () => {
  return (
    <div className="min-h-screen x-pattern-bg-light">
      <Navbar />
      <Hero />
      <Features />
      <HowItWorks />
      <Footer />
      <BackToTop />
    </div>
  )
}

export default HomePage
