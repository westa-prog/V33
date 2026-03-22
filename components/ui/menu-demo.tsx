import {
  Truck,
  Star,
  Home,
  Eye,
  Heart,
  Settings,
  LogOut,
} from 'lucide-react';
import { UserProfileSidebar } from '@/components/ui/menu';

export default function UserProfileSidebarDemo() {
  const user = {
    name: 'Emma',
    email: 'emma@nucleus-ui.com',
    avatarUrl: 'https://images.unsplash.com/photo-1544723795-3fb6469f5b39?w=900&auto=format&fit=crop&q=60&ixlib=M3wxMjA3fDB8MHxzZWFyY2h8Mjh8fHByb2ZpbGV8ZW58MHx8MHx8fDA%3D',
  };

  const navItems = [
    {
      label: 'My orders',
      href: '#orders',
      icon: <Truck className="h-full w-full" />,
    },
    {
      label: 'Reviews',
      href: '#reviews',
      icon: <Star className="h-full w-full" />,
    },
    {
      label: 'Delivery addresses',
      href: '#addresses',
      icon: <Home className="h-full w-full" />,
    },
    {
      label: 'Recently viewed',
      href: '#viewed',
      icon: <Eye className="h-full w-full" />,
    },
    {
      label: 'Favorite items',
      href: '#favorites',
      icon: <Heart className="h-full w-full" />,
    },
    {
      label: 'Settings',
      href: '#settings',
      icon: <Settings className="h-full w-full" />,
      isSeparator: true,
    },
  ];

  const logoutItem = {
    label: 'Log out',
    icon: <LogOut className="h-full w-full" />,
    onClick: () => alert('Logging out...'),
  };

  return (
    <div className="flex h-[600px] w-full items-center justify-center bg-background p-10">
      <UserProfileSidebar user={user} navItems={navItems} logoutItem={logoutItem} />
    </div>
  );
}
