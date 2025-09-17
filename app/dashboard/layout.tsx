'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { 
  HomeIcon, 
  DocumentPlusIcon, 
  ClipboardDocumentListIcon,
  UserGroupIcon,
  ChartBarIcon,
  CogIcon,
  ArrowRightOnRectangleIcon 
} from '@heroicons/react/24/outline';
import { UserRole } from '../../lib/types';
import { AuthUser } from '../../lib/auth';

interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<any>;
  roles: UserRole[];
}

const navigation: NavItem[] = [
  { 
    name: 'Dashboard', 
    href: '/dashboard', 
    icon: HomeIcon,
    roles: Object.values(UserRole)
  },
  { 
    name: 'My Requests', 
    href: '/dashboard/requests', 
    icon: ClipboardDocumentListIcon,
    roles: [UserRole.REQUESTER]
  },
  { 
    name: 'Create Request', 
    href: '/dashboard/requests/create', 
    icon: DocumentPlusIcon,
    roles: [UserRole.REQUESTER]
  },
  { 
    name: 'Pending Approvals', 
    href: '/dashboard/approvals', 
    icon: ClipboardDocumentListIcon,
    roles: [
      UserRole.INSTITUTION_MANAGER, 
      UserRole.SOP_VERIFIER,
      UserRole.ACCOUNTANT, 
      UserRole.VP, 
      UserRole.HEAD_OF_INSTITUTION,
      UserRole.DEAN,
      UserRole.MMA,
      UserRole.HR,
      UserRole.AUDIT,
      UserRole.IT,
      UserRole.CHIEF_DIRECTOR,
      UserRole.CHAIRMAN
    ]
  },
  { 
    name: 'Budget Management', 
    href: '/dashboard/budget', 
    icon: ChartBarIcon,
    roles: [UserRole.ACCOUNTANT, UserRole.DEAN, UserRole.CHIEF_DIRECTOR]
  },
  { 
    name: 'User Management', 
    href: '/dashboard/users', 
    icon: UserGroupIcon,
    roles: [UserRole.CHIEF_DIRECTOR, UserRole.CHAIRMAN]
  },
  { 
    name: 'Audit Logs', 
    href: '/dashboard/audit', 
    icon: CogIcon,
    roles: [UserRole.AUDIT, UserRole.CHIEF_DIRECTOR, UserRole.CHAIRMAN]
  },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const response = await fetch('/api/auth/me', {
        credentials: 'include'
      });
      if (response.ok) {
        const userData = await response.json();
        setUser(userData);
      } else {
        router.push('/login');
      }
    } catch (error) {
      router.push('/login');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { 
      method: 'POST',
      credentials: 'include'
    });
    router.push('/');
  };

  const filteredNavigation = navigation.filter(item => 
    user && item.roles.includes(user.role)
  );

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="h-screen flex overflow-hidden bg-gray-100">
      {/* Sidebar */}
      <div className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0">
        <div className="flex flex-col flex-grow bg-primary-600 pt-5 pb-4 overflow-y-auto">
          <div className="flex items-center flex-shrink-0 px-4">
            <h1 className="text-white text-lg font-semibold">
              SRM-RMP Approval
            </h1>
          </div>
          <nav className="mt-8 flex-1 flex flex-col divide-y divide-primary-700 overflow-y-auto" aria-label="Sidebar">
            <div className="px-2 space-y-1">
              {filteredNavigation.map((item) => (
                <Link
                  key={item.name}
                  href={item.href}
                  className="text-primary-200 hover:text-white hover:bg-primary-700 group flex items-center px-2 py-2 text-sm leading-6 font-medium rounded-md"
                >
                  <item.icon className="text-primary-300 mr-4 flex-shrink-0 h-6 w-6" aria-hidden="true" />
                  {item.name}
                </Link>
              ))}
            </div>
          </nav>
        </div>
      </div>

      {/* Main content */}
      <div className="lg:pl-64 flex flex-col flex-1">
        <div className="relative z-10 flex-shrink-0 flex h-16 bg-white border-b border-gray-200 lg:border-none">
          <div className="flex-1 px-4 flex justify-between sm:px-6 lg:max-w-6xl lg:mx-auto lg:px-8">
            <div className="flex-1 flex">
              {/* Search can be added here */}
            </div>
            <div className="ml-4 flex items-center md:ml-6">
              <div className="flex items-center space-x-4">
                <span className="text-gray-700 text-sm">
                  Welcome, <span className="font-medium">{user?.name}</span> ({user?.role})
                </span>
                <button
                  onClick={handleLogout}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <ArrowRightOnRectangleIcon className="h-6 w-6" />
                </button>
              </div>
            </div>
          </div>
        </div>

        <main className="flex-1 relative overflow-y-auto focus:outline-none">
          <div className="py-6">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8">
              {children}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}