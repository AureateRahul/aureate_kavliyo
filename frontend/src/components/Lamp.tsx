import React from 'react'
import { motion, useSpring, useTransform } from 'framer-motion'

interface LampProps {
  isOn: boolean
  toggleLight: () => void
}

export const Lamp: React.FC<LampProps> = ({ isOn, toggleLight }) => {
  const springConfig = { stiffness: 400, damping: 20 }
  const y = useSpring(0, springConfig)

  const cordTopX = 115
  const cordTopY = 90
  const restingLength = 160
  const cordRestingY = cordTopY + restingLength
  const cordEndY = useTransform(y, (value) => cordRestingY + value)

  const handleDragEnd = () => {
    if (y.get() > 50) toggleLight()
    y.set(0)
  }

  return (
    <div className="relative flex h-full w-full flex-col items-center justify-start pt-10 md:justify-center md:pt-0">
      <motion.div
        initial={false}
        animate={{ opacity: isOn ? 0.6 : 0, scale: isOn ? 1 : 0.8 }}
        transition={{ duration: 0.3 }}
        className="absolute left-1/2 top-1/2 h-[500px] w-[500px] -translate-x-1/2 -translate-y-[60%] rounded-full bg-green-400 blur-[100px]"
      />
      <div className="relative z-10 h-[450px] w-[320px]">
        <svg width="320" height="450" viewBox="0 0 320 450" className="overflow-visible">
          <rect x="152" y="150" width="16" height="180" rx="2" fill="#4B5563" />
          <ellipse cx="160" cy="330" rx="50" ry="12" fill="#374151" />
          <motion.line x1={cordTopX} y1={cordTopY} x2={cordTopX} y2={cordEndY} stroke="#FFFFFF" strokeWidth="4" strokeLinecap="round" />
          <motion.circle
            cx={cordTopX} cy={cordRestingY} r="8" fill="#FFFFFF"
            className="cursor-pointer touch-none"
            drag="y" dragConstraints={{ top: 0, bottom: 100 }}
            dragElastic={0.1} dragMomentum={false}
            onDragEnd={handleDragEnd}
            style={{ y }}
            whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
          />
          <motion.path
            d="M 100 70 Q 160 75 220 70 L 270 210 Q 160 230 50 210 Z"
            animate={{ fill: isOn ? '#86EFAC' : '#374151' }}
            transition={{ duration: 0.3 }}
          />
          <motion.path d="M 50 210 Q 160 230 270 210 L 265 205 Q 160 220 55 205 Z" fill="#000000" opacity={0.2} />
          {isOn && (
            <motion.path d="M 50 210 Q 160 230 270 210 L 260 200 Q 160 215 60 200 Z" fill="#F0FDF4" opacity={0.6} />
          )}
          <g transform="translate(130, 125)">
            {isOn ? (
              <>
                <circle cx="10" cy="10" r="5" fill="#1F2937" />
                <circle cx="50" cy="10" r="5" fill="#1F2937" />
                <path d="M 15 25 Q 30 40 45 25" stroke="#1F2937" strokeWidth="3" fill="none" strokeLinecap="round" />
                <path d="M 26 33 Q 30 42 34 33" fill="#EF4444" />
              </>
            ) : (
              <>
                <path d="M 5 15 Q 10 20 15 15" stroke="#9CA3AF" strokeWidth="2" fill="none" strokeLinecap="round" />
                <path d="M 45 15 Q 50 20 55 15" stroke="#9CA3AF" strokeWidth="2" fill="none" strokeLinecap="round" />
                <circle cx="30" cy="28" r="3" fill="#9CA3AF" />
              </>
            )}
          </g>
        </svg>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: !isOn ? 1 : 0 }}
          transition={{ delay: 1 }}
          className="absolute left-0 top-[260px] whitespace-nowrap text-sm font-medium text-gray-500 md:-left-12"
        >
          Pull to turn on →
        </motion.div>
      </div>
    </div>
  )
}
