'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import Button from '@/components/ui/Button';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { BuildingOfficeIcon } from '@heroicons/react/24/outline';

export default function Home() {
  const router = useRouter();
  const { isAuthenticated, loading } = useAuth();

  useEffect(() => {
    if (!loading) {
      if (isAuthenticated) {
        router.push('/dashboard');
      } else {
        router.push('/login');
      }
    }
  }, [isAuthenticated, loading, router]);

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="text-center max-w-2xl mx-auto px-6">
        <div className="mb-8 flex justify-center">
          <div className="bg-primary rounded-full p-6">
            <BuildingOfficeIcon className="h-16 w-16 text-white" />
          </div>
        </div>
        <h1 className="text-5xl font-bold text-primary mb-4">
          BSM System
        </h1>
        <p className="text-xl text-gray-600 mb-8">
          Building Systems Management
        </p>
        <p className="text-gray-500 mb-8">
          Comprehensive project and workforce management system
        </p>
        <div className="flex justify-center">
          <Button
            onClick={() => router.push('/login')}
            className="text-lg px-8 py-3"
          >
            Get Started
          </Button>
        </div>
      </div>
    </main>
  );
}

