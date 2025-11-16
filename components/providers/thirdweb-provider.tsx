'use client';

import { createThirdwebClient } from "thirdweb";
import { ThirdwebProvider } from "thirdweb/react";

const client = createThirdwebClient({ 
  clientId: process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID! 
});

interface ThirdwebProviderWrapperProps {
  children: React.ReactNode;
}

export function ThirdwebProviderWrapper({ children }: ThirdwebProviderWrapperProps) {
  return (
    <ThirdwebProvider>
      {children}
    </ThirdwebProvider>
  );
}

export { client };
