# SMS Module Documentation

## Overview
The SMS module provides a complete SMS campaign management system with modern UI, featuring inbox management, conversation handling, template management, and campaign creation.

## Architecture

### Components

#### `sms-client.tsx`
Main container component that orchestrates the entire SMS interface. Manages three main tabs:
- **Inbox**: View and manage conversations
- **Campaigns**: Create and launch SMS campaigns
- **Templates**: Manage SMS templates

**Props**: None (top-level component)

#### `sms-sidebar.tsx`
Navigation sidebar with tab switching functionality.
- Gradient-styled buttons for each section
- Active state indicators
- Professional branding with icon

**Props**:
- `activeTab: SmsTab` - Current active tab
- `setActiveTab: (tab: SmsTab) => void` - Tab change handler

#### `sms-inbox-list.tsx`
Displays list of conversations with search functionality.
- Real-time search (name or phone)
- Unread message counts
- Last message preview
- Loading states and error handling

**Props**:
- `selectedVoter: any` - Currently selected conversation
- `setSelectedVoter: (voter: any) => void` - Voter selection handler

#### `sms-chat-detail.tsx`
Main conversation view with message history and reply functionality.
- Full message history
- Auto-scrolling to latest messages
- Reply input with send functionality
- Loading and error states

**Props**:
- `voter: any` - Selected voter conversation data

#### `sms-templates-list.tsx`
Complete template management system.
- Create new templates
- Edit existing templates
- Delete templates
- Character counter with visual feedback

**Features**:
- Form-based template creation
- Media URL support
- Bulk template display
- Responsive grid layout

#### `sms-campaign-composer.tsx`
Campaign creation interface with comprehensive options.
- Campaign naming
- Template selection
- Audience selection (upload contacts or city-based)
- Contact management
- Real-time validation and feedback

**Features**:
- Bulk contact upload
- City-based targeting
- Summary cards showing campaign details
- Success/error notifications

## Styling

### Color Scheme
- **Primary**: Cyan/Blue gradients
- **Secondary**: Purple/Pink gradients
- **Tertiary**: Orange/Red gradients
- **Background**: Slate-900 to slate-800 gradients
- **Accent**: Emerald for success states

### Animations
- `fadeIn`: Message and content animations (0.4s)
- `slideDown`: Notification appearances
- `slideUp`: Modal and form animations
- `glow`: Active state indicators
- Custom scrollbars with smooth styling

## API Endpoints

### SMS Endpoints
```
GET  /api/sms/voters              - Fetch all voters in SMS
GET  /api/sms/templates/          - Fetch all templates
POST /api/sms/templates/          - Create new template
PUT  /api/sms/templates/:id       - Update template
DELETE /api/sms/templates/:id     - Delete template
GET  /api/sms/chats?voter_id=:id  - Fetch chat messages
POST /api/sms/send-reply          - Send reply message
POST /api/sms/campaign/           - Launch campaign
```

### Voter Endpoints
```
GET /api/voters?distinct=city     - Get list of cities
```

## Usage

### Basic Import
```typescript
import { SmsClient } from '@/components/sms';

export default function SmsPage() {
  return <SmsClient />;
}
```

### With Custom Styling
The component uses Tailwind CSS with custom animations defined in `globals.css`.

## Data Structures

### Voter
```typescript
interface Voter {
  id: string;
  name?: string;
  phone: string;
  lastMessage?: string;
  lastMessageTime?: string;
  unreadCount?: number;
}
```

### Message
```typescript
interface Message {
  id?: string;
  text: string;
  direction: 'inbound' | 'outbound';
  timestamp: string;
  campaign?: string;
}
```

### Template
```typescript
interface Template {
  id: string;
  name: string;
  body: string;
  media_url?: string;
}
```

### Contact
```typescript
interface Contact {
  phone: string;
  name?: string;
}
```

## Features

✅ **Modern UI/UX**
- Dark theme with gradients
- Smooth animations and transitions
- Responsive design
- Professional styling

✅ **Inbox Management**
- Search conversations by name or phone
- View message previews
- Track unread messages
- Real-time status updates

✅ **Chat Interface**
- Full conversation history
- Auto-scrolling to latest messages
- Send replies directly
- Timestamp and campaign tracking

✅ **Template Management**
- Create, edit, delete templates
- Character counter
- Media URL support
- Bulk display and management

✅ **Campaign Creation**
- Name campaigns
- Select templates
- Target by contacts or city
- Bulk contact import
- Real-time validation

✅ **Error Handling**
- User-friendly error messages
- Loading states
- Network error recovery
- Form validation feedback

## Performance

- Lazy component loading
- Optimized re-renders
- Efficient scrolling
- Debounced search
- Cached API responses

## Browser Support

- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)
- Mobile browsers

## Future Enhancements

- [ ] Message scheduling
- [ ] Campaign analytics
- [ ] Contact segmentation
- [ ] Template categories
- [ ] Bulk operations
- [ ] Export/Import functionality
- [ ] Advanced search filters
- [ ] Message archiving
- [ ] Team collaboration
- [ ] API webhooks

## Troubleshooting

### Messages not loading
- Check API endpoint connectivity
- Verify voter ID is valid
- Check browser console for errors

### Templates not appearing
- Ensure templates are created through the UI
- Check API response format
- Verify authentication

### Campaign launch fails
- Verify template is selected
- Check audience is configured
- Ensure at least one contact or city is selected
- Check phone number format

## Contributing

When adding new features:
1. Follow the existing component structure
2. Use Tailwind CSS for styling
3. Add TypeScript interfaces for data
4. Include error handling
5. Test on mobile devices
6. Update this documentation
