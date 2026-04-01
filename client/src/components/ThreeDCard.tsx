'use client';
import React, { useState, useRef, useCallback, ReactNode, CSSProperties, useLayoutEffect } from 'react';

interface ThreeDCardProps {
  children: ReactNode;
  className?: string;
  roundedClass?: string;
  maxRotation?: number;
  glowOpacity?: number;
  shadowBlur?: number;
  parallaxOffset?: number;
  transitionDuration?: string;
  backgroundImage?: string | null;
  enableGlow?: boolean;
  enableShadow?: boolean;
  enableParallax?: boolean;
  isFlipped?: boolean;
}

const FLIP_DURATION_MS = 1200;

const DEFAULT_TRANSFORM = {
  rotateX: 0,
  rotateY: 0,
  glowX: 50,
  glowY: 50,
  shadowX: 0,
  shadowY: 20,
  isHovered: false,
};

function ThreeDCard({
  children,
  className = '',
  roundedClass = 'rounded-2xl',
  maxRotation = 10,
  glowOpacity = 0.2,
  shadowBlur = 30,
  parallaxOffset = 40,
  transitionDuration = '0.6s',
  backgroundImage = null,
  enableGlow = true,
  enableShadow = true,
  enableParallax = true,
  isFlipped = false,
}: ThreeDCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  
  const [isFlipping, setIsFlipping] = useState(false);
  const prevIsFlipped = useRef(isFlipped);
  const [transform, setTransform] = useState(DEFAULT_TRANSFORM);

  useLayoutEffect(() => {
    if (prevIsFlipped.current !== isFlipped) {
      setTransform(DEFAULT_TRANSFORM);
      setIsFlipping(true);
      const timer = setTimeout(() => setIsFlipping(false), FLIP_DURATION_MS);
      prevIsFlipped.current = isFlipped;
      return () => clearTimeout(timer);
    }
  }, [isFlipped]);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!cardRef.current || isFlipping) return;

      const rect = cardRef.current.getBoundingClientRect();
      const { width, height, left, top } = rect;

      const mouseX = e.clientX - left;
      const mouseY = e.clientY - top;

      const xPct = mouseX / width - 0.5;
      const yPct = mouseY / height - 0.5;

      const newRotateX = yPct * -1 * maxRotation;
      const newRotateY = xPct * maxRotation;

      setTransform(prev => ({
        ...prev,
        rotateX: newRotateX,
        rotateY: newRotateY,
        glowX: (mouseX / width) * 100,
        glowY: (mouseY / height) * 100,
        shadowX: enableShadow ? newRotateY * 0.8 : 0,
        shadowY: enableShadow ? 20 - newRotateX * 0.6 : 20,
        isHovered: true,
      }));
    },
    [maxRotation, enableShadow, isFlipping]
  );

  const handleMouseEnter = useCallback(() => {
    if (isFlipping) return;
    setTransform(prev => ({ ...prev, isHovered: true }));
  }, [isFlipping]);

  const handleMouseLeave = useCallback(() => {
    setTransform(DEFAULT_TRANSFORM);
  }, []);

  const handleTouchMove = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      if (!cardRef.current || isFlipping) return;
      const touch = e.touches[0];
      if (!touch) return;

      const rect = cardRef.current.getBoundingClientRect();
      const { width, height, left, top } = rect;

      const touchX = touch.clientX - left;
      const touchY = touch.clientY - top;

      const xPct = touchX / width - 0.5;
      const yPct = touchY / height - 0.5;

      const newRotateX = yPct * -1 * maxRotation;
      const newRotateY = xPct * maxRotation;

      setTransform(prev => ({
        ...prev,
        rotateX: newRotateX,
        rotateY: newRotateY,
        glowX: (touchX / width) * 100,
        glowY: (touchY / height) * 100,
        shadowX: enableShadow ? newRotateY * 0.8 : 0,
        shadowY: enableShadow ? 20 - newRotateX * 0.6 : 20,
        isHovered: true,
      }));
    },
    [maxRotation, enableShadow, isFlipping]
  );

  const handleTouchStart = useCallback(() => {
    if (isFlipping) return;
    setTransform(prev => ({ ...prev, isHovered: true }));
  }, [isFlipping]);

  const handleTouchEnd = useCallback(() => {
    setTransform(DEFAULT_TRANSFORM);
  }, []);

  const finalRotateY = transform.rotateY + (isFlipped ? 180 : 0);
  const shouldUseFlipTransition = isFlipping || prevIsFlipped.current !== isFlipped;
  
  const currentTransition = shouldUseFlipTransition
    ? `transform ${FLIP_DURATION_MS}ms ease-in-out, box-shadow ${FLIP_DURATION_MS}ms ease-in-out`
    : `transform ${transitionDuration} cubic-bezier(0.23, 1, 0.32, 1), box-shadow ${transitionDuration} cubic-bezier(0.23, 1, 0.32, 1)`;

  const cardStyle: CSSProperties = {
    transform: `perspective(1000px) rotateX(${transform.rotateX}deg) rotateY(${finalRotateY}deg) scale3d(1, 1, 1)`,
    boxShadow: enableShadow
      ? `${transform.shadowX}px ${transform.shadowY}px ${shadowBlur}px rgba(0, 0, 0, 0.4)`
      : 'none',
    transition: currentTransition,
    transformStyle: 'preserve-3d',
  };

  const backgroundStyle = backgroundImage
    ? {
        backgroundImage: `url(${backgroundImage})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        opacity: transform.isHovered ? 1 : 0,
        transition: `opacity 0.5s ease-in-out`,
      }
    : {};

  const glowStyle = enableGlow
    ? {
        background: `radial-gradient(circle at ${transform.glowX}% ${transform.glowY}%, rgba(255, 255, 255, ${glowOpacity}), transparent)`,
        opacity: transform.isHovered ? 1 : 0,
        transition: 'opacity 0.5s ease-in-out',
      }
    : {};

  const contentStyle: CSSProperties = enableParallax
    ? {
        transform: `translateZ(${parallaxOffset}px)`,
        transformStyle: 'preserve-3d',
      }
    : {};

  return (
    <div style={{ perspective: '1000px' }} className={className}>
      <div
        ref={cardRef}
        onMouseMove={handleMouseMove}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onTouchMove={handleTouchMove}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        style={cardStyle}
        className={`relative bg-gray-800 ${roundedClass} overflow-visible transition-[border-radius] duration-500 w-full h-full`}
        role="img"
        tabIndex={0}
        onFocus={handleMouseEnter}
        onBlur={handleMouseLeave}
      >
        {backgroundImage && (
          <div
            className={`absolute inset-0 ${roundedClass}`}
            style={backgroundStyle}
            aria-hidden="true"
          />
        )}

        <div
          className={`absolute inset-0 border-2 border-white/10 ${roundedClass} pointer-events-none transition-[border-radius] duration-500`}
          aria-hidden="true"
        />

        {enableGlow && (
          <div
            className={`absolute inset-0 z-0 ${roundedClass} pointer-events-none`}
            style={glowStyle}
            aria-hidden="true"
          />
        )}

        <div style={contentStyle} className="relative z-10 w-full h-full">
          {children}
        </div>
      </div>
    </div>
  );
}

export default ThreeDCard;
