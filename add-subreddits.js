#!/usr/bin/env node

// Comprehensive list of subreddits for opportunity finding
const subreddits = [
  // === IDEA/REQUEST SUBREDDITS (High Signal) ===
  "SomebodyMakeThis",      // People explicitly requesting products
  "AppIdeas",              // App concepts
  "Startup_Ideas",         // Startup concepts
  "indiebiz",              // Indie business ideas
  "Business_Ideas",        // Business concepts
  "sideproject",           // Side project discussions
  "InternetIsBeautiful",   // Cool web tools (see what's popular)
  
  // === ENTREPRENEURSHIP/BUSINESS ===
  "Entrepreneur",
  "startups",
  "SaaS",
  "smallbusiness",
  "IndieBiz",
  "sweatystartup",         // Service business ideas
  "EntrepreneurRideAlong", // Building businesses live
  "juststart",             // Starting online businesses
  "growmybusiness",
  "advancedentrepreneur",
  "Shopify",               // E-commerce
  "ecommerce",
  "dropship",
  "FulfillmentByAmazon",   // FBA sellers
  "AmazonSeller",
  "EtsySellers",
  
  // === FREELANCE/AGENCY ===
  "freelance",
  "freelanceWriters",
  "DigitalNomad",
  "WorkOnline",
  "beermoney",             // Side income ideas
  "passive_income",
  "Upwork",
  "Fiverr",
  
  // === TECH/SOFTWARE ===
  "webdev",
  "SideProject",
  "cofounder",
  "nocode",
  "lowcode",
  "selfhosted",            // Self-hosted software needs
  "opensource",
  "programming",
  "learnprogramming",
  "ArtificialIntelligence",
  "MachineLearning",
  "ChatGPT",
  "LocalLLaMA",
  "AutomateYourself",
  
  // === MARKETING/GROWTH ===
  "marketing",
  "digital_marketing",
  "SEO",
  "socialmedia",
  "content_marketing",
  "PPC",
  "bigseo",
  "affiliatemarketing",
  "GrowthHacking",
  "emailmarketing",
  
  // === FINANCE/MONEY ===
  "personalfinance",
  "FinancialIndependence",
  "fatFIRE",
  "leanfire",
  "investing",
  "stocks",
  "wallstreetbets",        // Retail sentiment
  "CryptoCurrency",
  "defi",
  
  // === PRODUCTIVITY/TOOLS ===
  "productivity",
  "GetMotivated",
  "GetDisciplined",
  "Notion",
  "ObsidianMD",
  "PKMS",                  // Personal knowledge management
  "Trello",
  "todoist",
  "LifeProTips",
  
  // === DESIGN/CREATIVE ===
  "web_design",
  "UI_Design",
  "userexperience",
  "graphic_design",
  "logodesign",
  "Design",
  "InDesign",
  "Figma",
  
  // === NICHE INDUSTRIES ===
  "realestateinvesting",
  "RealEstate",
  "PropertyManagement",
  "Landlord",
  "restaurateur",
  "foodtrucks",
  "weddingplanning",
  "photography",
  "videography",
  "podcasting",
  "youtubers",
  "Twitch",
  "NewTubers",
  "PartneredYoutube",
  
  // === HEALTH/FITNESS ===
  "Fitness",
  "nutrition",
  "loseit",
  "bodyweightfitness",
  "Supplements",
  "MealPrepSunday",
  "running",
  "cycling",
  "yoga",
  
  // === EDUCATION/LEARNING ===
  "Teachers",
  "education",
  "OnlineEducation",
  "languagelearning",
  "learnspanish",
  "learnpython",
  "AskAcademia",
  "GradSchool",
  
  // === PARENTING/FAMILY ===
  "Parenting",
  "Mommit",
  "daddit",
  "beyondthebump",
  "homeschool",
  
  // === HOME/DIY ===
  "HomeImprovement",
  "DIY",
  "woodworking",
  "gardening",
  "homeautomation",
  "smarthome",
  "InteriorDesign",
  "organization",
  "declutter",
  
  // === PETS ===
  "dogs",
  "cats",
  "Pets",
  "Dogtraining",
  "AquaSwap",
  
  // === GAMING ===
  "gaming",
  "gamedev",
  "indiegaming",
  "gameideas",
  "boardgames",
  "tabletopgamedesign",
  
  // === HOBBIES ===
  "Cooking",
  "recipes",
  "Baking",
  "crafts",
  "knitting",
  "crochet",
  "sewing",
  "leathercraft",
  "3Dprinting",
  "metalworking",
  
  // === LEGAL/PROFESSIONAL ===
  "legaladvice",
  "Accounting",
  "tax",
  "Insurance",
  "consulting",
  
  // === REMOTE WORK ===
  "remotework",
  "WFH",
  "digitalnomad",
  "remotejobs",
  
  // === LOCAL/COMMUNITY ===
  "smallbusinessuk",
  "UKPersonalFinance",
  "AusFinance",
  "PersonalFinanceCanada",
  
  // === MISC HIGH-VALUE ===
  "AskReddit",             // General pain points
  "DoesAnybodyElse",       // Common frustrations
  "CrazyIdeas",            // Wild ideas (some are gold)
  "Showerthoughts",        // Insights
  "TrueOffMyChest",        // Frustrations/pain points
  "rant",                  // Pain points
  "mildlyinfuriating",     // UX problems
  "assholedesign",         // Bad product design
  "firstworldproblems",    // Problems to solve
];

const API_URL = process.env.API_URL || "https://reddit.lukelab.click";

async function addSubreddits() {
  console.log(`Adding ${subreddits.length} subreddits to ${API_URL}...\n`);
  
  let added = 0;
  let skipped = 0;
  let failed = 0;
  
  for (const name of subreddits) {
    try {
      const res = await fetch(`${API_URL}/api/subreddits`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      
      if (res.status === 201) {
        console.log(`✓ Added r/${name}`);
        added++;
      } else if (res.status === 409) {
        console.log(`- Skipped r/${name} (already exists)`);
        skipped++;
      } else {
        const err = await res.json();
        console.log(`✗ Failed r/${name}: ${err.error}`);
        failed++;
      }
    } catch (err) {
      console.log(`✗ Failed r/${name}: ${err.message}`);
      failed++;
    }
    
    // Small delay to avoid hammering the API
    await new Promise(r => setTimeout(r, 50));
  }
  
  console.log(`\n=== Summary ===`);
  console.log(`Added: ${added}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total: ${subreddits.length}`);
}

addSubreddits();
