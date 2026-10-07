import { Route, Routes } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import Home from "./pages/Home";
import SignIn from "./pages/SignIn";
import StorybookHome from "./pages/StorybookHome";
import Setup from "./pages/Setup";
import ThisWeek from "./pages/ThisWeek";
import Memories from "./pages/Memories";
import MemoryDetail from "./pages/MemoryDetail";
import MemoryDelete from "./pages/MemoryDelete";
import Recorder from "./pages/Recorder";
import Reader, { ReadLatest } from "./pages/Reader";
import StoryFeedback from "./pages/StoryFeedback";
import Family from "./pages/Family";
import ShareChapter, { ChapterAccess } from "./pages/ShareChapter";
import ChapterPages from "./pages/ChapterPages";
import OurCharacters from "./pages/OurCharacters";
import FamilyCharacterDetail from "./pages/FamilyCharacterDetail";
import InvitationAccept from "./pages/InvitationAccept";
import Settings from "./pages/Settings";
import SettingsReminders from "./pages/SettingsReminders";
import SettingsStoryPreferences from "./pages/SettingsStoryPreferences";
import SettingsPrivacy from "./pages/SettingsPrivacy";
import ExportMemories, { ExportStatus } from "./pages/Export";
import Account, { DeleteAccount, Help } from "./pages/Account";
import HowItWorks from "./pages/HowItWorks";
import { Privacy, Terms } from "./pages/Legal";
import AdminFeedback from "./pages/admin/AdminFeedback";
import AdminGuideBook from "./pages/admin/AdminGuideBook";
import YourStorybooks from "./pages/YourStorybooks";
import TryStory, { TrySave } from "./pages/TryStory";
import AdminLayout from "./pages/admin/AdminLayout";
import AdminReviewQueue from "./pages/admin/AdminReviewQueue";
import AdminChapterReview from "./pages/admin/AdminChapterReview";
import AdminPromptLibrary from "./pages/admin/AdminPromptLibrary";
import AdminPromptEdit from "./pages/admin/AdminPromptEdit";
import AdminMessages from "./pages/admin/AdminMessages";
import AdminMessageEdit from "./pages/admin/AdminMessageEdit";
import AdminAiInstructions from "./pages/admin/AdminAiInstructions";
import AdminAiInstructionEdit from "./pages/admin/AdminAiInstructionEdit";
import AdminPageRules from "./pages/admin/AdminPageRules";
import AdminCharacters from "./pages/admin/AdminCharacters";
import AdminCharacterEdit from "./pages/admin/AdminCharacterEdit";
import AdminOverview, { AdminFamilies, AdminSettings, AdminVisitors } from "./pages/admin/AdminOverview";
import AdminCosts from "./pages/admin/AdminCosts";

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<AdminOverview />} />
          <Route path="families" element={<AdminFamilies />} />
          <Route path="settings" element={<AdminSettings />} />
          <Route path="review" element={<AdminReviewQueue />} />
          <Route path="review/:chapterId" element={<AdminChapterReview />} />
          <Route path="prompts" element={<AdminPromptLibrary />} />
          <Route path="prompts/:id" element={<AdminPromptEdit />} />
          <Route path="messages" element={<AdminMessages />} />
          <Route path="messages/:key" element={<AdminMessageEdit />} />
          <Route path="ai" element={<AdminAiInstructions />} />
          <Route path="ai/:key" element={<AdminAiInstructionEdit />} />
          <Route path="page-rules" element={<AdminPageRules />} />
          <Route path="characters" element={<AdminCharacters />} />
          <Route path="characters/:id" element={<AdminCharacterEdit />} />
          <Route path="costs" element={<AdminCosts />} />
          <Route path="visitors" element={<AdminVisitors />} />
          <Route path="feedback" element={<AdminFeedback />} />
          <Route path="guide" element={<AdminGuideBook />} />
        </Route>

        <Route
          path="*"
          element={
            <div className="shell">
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/sign-in" element={<SignIn />} />
                <Route path="/start" element={<Setup />} />
                <Route path="/invitations/:token" element={<InvitationAccept />} />
                <Route path="/storybooks/:id" element={<StorybookHome />} />
                <Route path="/storybooks/:id/record" element={<Recorder />} />
                <Route path="/storybooks/:id/this-week" element={<ThisWeek />} />
                <Route path="/storybooks/:id/memories" element={<Memories />} />
                <Route path="/storybooks/:id/memories/:memoryId" element={<MemoryDetail />} />
                <Route path="/storybooks/:id/memories/:memoryId/delete" element={<MemoryDelete />} />
                <Route path="/storybooks/:id/read" element={<ReadLatest />} />
                <Route path="/storybooks/:id/read/:chapterId" element={<Reader />} />
                <Route path="/storybooks/:id/chapters/:chapterId/feedback" element={<StoryFeedback />} />
                <Route path="/storybooks/:id/family" element={<Family />} />
                <Route path="/storybooks/:id/chapters/:chapterId/share" element={<ShareChapter />} />
                <Route path="/storybooks/:id/chapters/:chapterId/access" element={<ChapterAccess />} />
                <Route path="/storybooks/:id/chapters/:chapterId/pages" element={<ChapterPages />} />
                <Route path="/storybooks/:id/characters" element={<OurCharacters />} />
                <Route path="/storybooks/:id/characters/:characterId" element={<FamilyCharacterDetail />} />
                <Route path="/storybooks/:id/settings" element={<Settings />} />
                <Route path="/storybooks/:id/settings/reminders" element={<SettingsReminders />} />
                <Route path="/storybooks/:id/settings/story-preferences" element={<SettingsStoryPreferences />} />
                <Route path="/storybooks/:id/settings/privacy" element={<SettingsPrivacy />} />
                <Route path="/storybooks/:id/settings/export" element={<ExportMemories />} />
                <Route path="/storybooks/:id/settings/export/:exportId" element={<ExportStatus />} />
                <Route path="/storybooks/:id/settings/account" element={<Account />} />
                <Route path="/storybooks/:id/settings/delete-account" element={<DeleteAccount />} />
                <Route path="/help" element={<Help />} />
                <Route path="/how-it-works" element={<HowItWorks />} />
                <Route path="/terms" element={<Terms />} />
                <Route path="/privacy" element={<Privacy />} />
                <Route path="/storybooks" element={<YourStorybooks />} />
                <Route path="/try" element={<TryStory />} />
                <Route path="/try/save" element={<TrySave />} />
              </Routes>
            </div>
          }
        />
      </Routes>
    </AuthProvider>
  );
}
