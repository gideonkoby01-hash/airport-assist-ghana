import React from "react";
import { Link } from "react-router-dom";
import { Plane } from "lucide-react";
import { useHomeCta } from "@/components/home/useHomeCta";
import { useSettings } from "@/lib/SettingsContext";

export default function SiteFooter() {
  const { bookDest, signInDest, isAuthenticated } = useHomeCta();
  const { settings } = useSettings();

  return (
    <footer className="bg-[#0b213c] text-white">
      <div className="h-1 tricolor-bar" />
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-14">
        <div className="grid md:grid-cols-3 gap-10">
          <div>
            <div className="flex items-center gap-2">
              <Plane className="w-7 h-7 text-[#d4af37]" />
              <div className="leading-tight">
                <span className="block font-semibold tracking-wide">
                  Airport Assist Ghana
                </span>
                <span className="block text-[#d4af37] text-[10px] uppercase tracking-[0.2em]">
                  Akwaaba Services
                </span>
              </div>
            </div>
            <p className="mt-4 text-sm text-white/70 max-w-sm leading-relaxed">
              Personalised airport concierge and passenger assistance at Accra
              International Airport, Accra. Available 24 hours a day, 7 days a
              week.
            </p>
          </div>

          <div>
            <h4 className="font-semibold text-[#d4af37] uppercase tracking-wider text-xs">
              Explore
            </h4>
            <ul className="mt-4 space-y-2 text-sm">
              <li><a href="#home" className="text-white/75 hover:text-[#d4af37]">Home</a></li>
              <li><a href="#services" className="text-white/75 hover:text-[#d4af37]">Our Services</a></li>
              <li><a href="#how-it-works" className="text-white/75 hover:text-[#d4af37]">How It Works</a></li>
              <li><a href="#faq" className="text-white/75 hover:text-[#d4af37]">FAQ</a></li>
              <li><a href="#contact" className="text-white/75 hover:text-[#d4af37]">Contact Us</a></li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold text-[#d4af37] uppercase tracking-wider text-xs">
              Account
            </h4>
            <ul className="mt-4 space-y-2 text-sm">
              <li>
                <Link to={signInDest} className="text-white/75 hover:text-[#d4af37]">
                  {isAuthenticated ? "Dashboard" : "Sign In"}
                </Link>
              </li>
              <li>
                <Link to={bookDest} className="text-white/75 hover:text-[#d4af37]">
                  Book Now
                </Link>
              </li>
              <li className="pt-2 text-white/60 text-xs">{settings.contact_phone}</li>
              <li className="text-white/60 text-xs">{settings.contact_email}</li>
              <li className="text-white/60 text-xs">{settings.contact_address}</li>
            </ul>
          </div>
        </div>

        <div className="mt-12 pt-6 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-white/50">
          <p>© {new Date().getFullYear()} {settings.company_name}. All rights reserved.</p>
          <p>
            <Link to="/privacy" className="hover:text-[#d4af37] underline-offset-2 hover:underline">Privacy notice</Link>
            <span className="mx-2">·</span>
            Accra International Airport, Accra, Ghana
          </p>
        </div>
      </div>
    </footer>
  );
}