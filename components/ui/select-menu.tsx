"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

type SelectOption = {
  label: string;
  value: string;
};

type SelectMenuProps = {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  className?: string;
  triggerClassName?: string;
  menuClassName?: string;
  disabled?: boolean;
};

const SelectMenu = ({
  value,
  options,
  onChange,
  className,
  triggerClassName,
  menuClassName,
  disabled = false,
}: SelectMenuProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  const selected = useMemo(
    () => options.find((option) => option.value === value) || options[0],
    [options, value]
  );

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen((prev) => !prev)}
        className={cn(
          "inline-flex items-center gap-2 rounded-xl border border-white/10 bg-[#11111198] px-3 py-2 text-sm font-medium text-white shadow-[0_0_20px_rgba(0,0,0,0.18)] backdrop-blur-sm transition-colors hover:bg-[#111111d1] disabled:cursor-not-allowed disabled:opacity-60",
          triggerClassName
        )}
      >
        <span className="truncate">{selected?.label || value}</span>
        <motion.span
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.25, ease: "easeInOut" }}
        >
          <ChevronDown className="h-4 w-4 opacity-80" />
        </motion.span>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ y: -5, scale: 0.96, opacity: 0, filter: "blur(8px)" }}
            animate={{ y: 0, scale: 1, opacity: 1, filter: "blur(0px)" }}
            exit={{ y: -5, scale: 0.96, opacity: 0, filter: "blur(8px)" }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className={cn(
              "absolute right-0 z-40 mt-2 min-w-full overflow-hidden rounded-xl border border-white/10 bg-[#111111e8] p-1 shadow-[0_0_20px_rgba(0,0,0,0.2)] backdrop-blur-sm",
              menuClassName
            )}
          >
            <div className="flex max-h-72 flex-col gap-1 overflow-y-auto">
              {options.map((option, index) => {
                const active = option.value === value;
                return (
                  <motion.button
                    key={`${option.value}-${index}`}
                    type="button"
                    initial={{ opacity: 0, x: 8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 8 }}
                    transition={{ duration: 0.16, delay: index * 0.03 }}
                    onClick={() => {
                      onChange(option.value);
                      setIsOpen(false);
                    }}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm text-white transition-colors hover:bg-white/10",
                      active && "bg-white/10"
                    )}
                  >
                    <span className="flex-1 truncate">{option.label}</span>
                    {active && <Check className="h-4 w-4 text-emerald-300" />}
                  </motion.button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export { SelectMenu };
