import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { User, Lock, Eye, EyeOff, ArrowRight, Loader2 } from 'lucide-react'
import { supabase } from '../lib/supabase'

type AuthMode = 'LOGIN' | 'SIGNUP'

interface AuthFormProps {
  isOn: boolean
}

export const AuthForm: React.FC<AuthFormProps> = ({ isOn }) => {
  const [mode, setMode] = useState<AuthMode>('LOGIN')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const containerVariants = {
    hidden: { opacity: 0, y: 20, filter: 'blur(10px)', scale: 0.95, pointerEvents: 'none' as const },
    visible: {
      opacity: 1, y: 0, filter: 'blur(0px)', scale: 1, pointerEvents: 'auto' as const,
      transition: { duration: 0.4, ease: 'easeOut' as const, delay: 0.1 },
    },
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setMessage(null)

    try {
      if (mode === 'LOGIN') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      } else {
        if (!email.toLowerCase().endsWith('@aureatelabs.com')) {
          throw new Error('Only @aureatelabs.com email addresses are allowed to sign up.')
        }
        const { error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        setMessage('Account created! Check your email to confirm, then log in.')
        setMode('LOGIN')
        setEmail('')
        setPassword('')
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex h-full w-full items-center justify-center p-4">
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate={isOn ? 'visible' : 'hidden'}
        className="relative w-full max-w-md overflow-hidden rounded-2xl border border-gray-700 bg-gray-800/50 shadow-2xl backdrop-blur-md"
        style={{ boxShadow: isOn ? '0 0 40px -10px rgba(74, 222, 128, 0.3)' : 'none' }}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={mode}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
            className="p-8"
          >
            <div className="mb-8 text-center">
              <h2 className="text-3xl font-bold text-white">
                {mode === 'LOGIN' ? 'Welcome Back' : 'Create Account'}
              </h2>
              <p className="mt-2 text-sm text-gray-400">
                {mode === 'LOGIN' ? 'Enter your details to access your workspace.' : 'Join us and start your journey today.'}
              </p>
            </div>

            {error && (
              <div className="mb-4 rounded-lg bg-red-900/50 border border-red-700 px-4 py-3 text-sm text-red-300">
                {error}
              </div>
            )}
            {message && (
              <div className="mb-4 rounded-lg bg-green-900/50 border border-green-700 px-4 py-3 text-sm text-green-300">
                {message}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="relative">
                <div className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400">
                  <User size={18} />
                </div>
                <input
                  type="email"
                  placeholder="Email Address"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  className="w-full rounded-lg border border-gray-600 bg-gray-900 py-3 pl-10 pr-4 text-white placeholder-gray-500 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                />
              </div>

              <div className="relative">
                <div className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400">
                  <Lock size={18} />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  className="w-full rounded-lg border border-gray-600 bg-gray-900 py-3 pl-10 pr-10 text-white placeholder-gray-500 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-white"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                type="submit"
                disabled={loading}
                className="group relative w-full overflow-hidden rounded-lg bg-green-600 py-3 font-bold text-white shadow-lg transition-all hover:bg-green-500 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <span className="relative z-10 flex items-center justify-center gap-2">
                  {loading ? <Loader2 size={18} className="animate-spin" /> : (
                    <>{mode === 'LOGIN' ? 'Login' : 'Sign Up'} <ArrowRight size={18} /></>
                  )}
                </span>
                <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-500 group-hover:translate-x-full" />
              </motion.button>
            </form>

            <div className="mt-6 text-center text-sm text-gray-400">
              {mode === 'LOGIN' ? (
                <>Don't have an account?{' '}
                  <button onClick={() => { setMode('SIGNUP'); setError(null); setMessage(null) }} className="font-bold text-green-400 hover:text-green-300 hover:underline">
                    Sign Up
                  </button>
                </>
              ) : (
                <>Already have an account?{' '}
                  <button onClick={() => { setMode('LOGIN'); setError(null); setMessage(null) }} className="font-bold text-green-400 hover:text-green-300 hover:underline">
                    Login
                  </button>
                </>
              )}
            </div>
          </motion.div>
        </AnimatePresence>
      </motion.div>
    </div>
  )
}
