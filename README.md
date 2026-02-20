# ToolShed AI

ToolShed AI is a smart tool organization and inventory management application designed to help you track, lend, and maintain your tools efficiently. Built with modern web technologies and AI capabilities, it offers a premium user experience on both web and mobile.

## Features

- **Inventory Management**: Track tools with details, photos, tags, and automatically generated specifications.
- **AI-Powered Scanning**: Use Google Gemini AI to identify tools from photos, extract details, and suggest categories without manual entry.
- **AI Work Assistant**: Input project details (e.g., "Build a deck") to have the AI cross-reference required tools against your existing inventory and generate a smart shopping list for what's missing.
- **Precision Image Cropping**: Built-in freeform image cropper to perfectly frame your tool photos before database upload.
- **Lending Tracker**: Keep track of tools lent to friends or colleagues with borrowing histories, set return dates, and log notes.
- **Maintenance Scheduler**: Schedule recurring maintenance tasks across your equipment and track service history.
- **Location & Container Setup**: Organize tools hierarchically by Location (e.g., Garage) and specific Container (e.g., Red Toolbox).
- **Mobile First**: Fully responsive design with a native offline-ready Android app via Capacitor, including native smartphone barcode scanning.

## Tech Stack

- **Frontend**: React 19, TypeScript, Vite
- **Styling**: Tailwind CSS 4, Framer Motion, Lucide React
- **Backend/Database**: Supabase
- **AI**: Google Generative AI (Gemini)
- **Mobile**: Capacitor 8 (Android)

## Getting Started

### Prerequisites

- Node.js (v18 or later)
- npm or yarn
- A Supabase project
- A Google Gemini API Key

### Installation

1.  Clone the repository:
    ```bash
    git clone https://github.com/yourusername/toolshed-ai.git
    cd toolshed-ai
    ```

2.  Install dependencies:
    ```bash
    npm install
    ```

3.  Configure Environment Variables:
    Create a `.env` file in the root directory and add the following keys:
    ```env
    VITE_SUPABASE_URL=your_supabase_project_url
    VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
    ```

    Then open the app Settings page and save your Gemini API key in-app.

4.  Start the development server:
    ```bash
    npm run dev
    ```

## Building for Production

### Web
To build the web application:
```bash
npm run build
```
The output will be in the `dist` directory.

### Android
To build the Android APK:
1.  Sync the project:
    ```bash
    npm run android:sync
    ```
2.  Open in Android Studio or build via command line:
    ```bash
    npm run android:release
    ```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

[MIT](LICENSE)
