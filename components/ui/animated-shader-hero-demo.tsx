import React from 'react';
import Hero from '@/components/ui/animated-shader-hero';

const HeroDemo: React.FC = () => (
  <div className="w-full">
    <Hero
      trustBadge={{ text: 'Trusted by forward-thinking teams.', icons: ['✨'] }}
      headline={{ line1: 'Launch Your', line2: 'Workflow Into Orbit' }}
      subtitle="Supercharge productivity with AI-powered automation and integrations built for the next generation of teams."
      buttons={{
        primary: { text: 'Get Started for Free', onClick: () => console.log('Get Started clicked!') },
        secondary: { text: 'Explore Features', onClick: () => console.log('Explore Features clicked!') }
      }}
    />
  </div>
);

export default HeroDemo;
