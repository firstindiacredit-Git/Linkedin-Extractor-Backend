const express = require("express");
const { Builder, By, until, Key } = require("selenium-webdriver");
const chrome = require("selenium-webdriver/chrome");
const bodyParser = require("body-parser");
const CORS = require("cors");

const app = express();
const port = 3000;
app.use(CORS("*"));
app.use(bodyParser.json());

app.listen(port, () => {
  console.log(`Server is listening on port ${port}`);
});

app.post("/scrape", async (req, res) => {
  const { industry, country, pages } = req.body;

  if (!industry || !country || !pages) {
    return res.status(400).send({ error: "Missing parameters" });
  }

  let chromeOptions = new chrome.Options();
  chromeOptions.addArguments("--headless");
  chromeOptions.addArguments("--dns-prefetch-disable");
  chromeOptions.addArguments('--proxy-server="direct://"');
  chromeOptions.addArguments("--proxy-bypass-list=*");
  chromeOptions.addArguments("--start-maximized");
  chromeOptions.addArguments("--disable-blink-features=AutomationControlled");
  chromeOptions.addArguments(
    "--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
  );

  let driver = await new Builder()
    .forBrowser("chrome")
    .setChromeOptions(chromeOptions)
    .build();

  try {
    let profiles = [];
    let currentPage = 1;
    const maxPages = parseInt(pages, 10);
    let processedUrls = new Set();

    // Initial search
    await driver.get(
      `https://www.google.com/search?q=site:linkedin.com/in+${encodeURIComponent(
        industry
      )}+${encodeURIComponent(country)}&num=10`
    );

    while (currentPage <= maxPages) {
      console.log(`Scraping page ${currentPage}`);

      // Wait for results to load
      await driver.wait(until.elementLocated(By.css("div#search")), 10000);

      // Add random delay to mimic human behavior
      await new Promise((resolve) =>
        setTimeout(resolve, 1000 + Math.random() * 2000)
      );

      // Extract profile links
      const profileElements = await driver.findElements(By.css("div.g"));

      for (let element of profileElements) {
        try {
          const linkElement = await element.findElement(By.css("a"));
          const profileLink = await linkElement.getAttribute("href");

          // Skip if we've already processed this URL
          if (processedUrls.has(profileLink)) continue;
          processedUrls.add(profileLink);

          // Extract profile name
          const profileNameElement = await element.findElement(By.css("h3"));
          const profileName = await profileNameElement.getText();

          // Extract description/address
          let profileAddress = "No address found";
          try {
            const descriptionElement = await element.findElement(
              By.css("div.VwiC3b")
            );
            profileAddress = await descriptionElement.getText();
          } catch (e) {
            // Description element not found, continue with default value
          }

          if (profileLink.includes("linkedin.com/in/")) {
            profiles.push({
              name: profileName,
              link: profileLink,
              address: profileAddress,
            });
          }
        } catch (e) {
          console.error("Error extracting profile data:", e);
        }
      }

      if (currentPage >= maxPages) break;

      // Find and click the next page button
      try {
        const nextButton = await driver.findElement(By.id("pnnext"));
        await driver.executeScript(
          "arguments[0].scrollIntoView(true);",
          nextButton
        );
        await new Promise((resolve) => setTimeout(resolve, 1000));
        await nextButton.click();
        currentPage++;

        // Wait for the new page to load
        await driver.wait(until.elementLocated(By.css("div#search")), 10000);
      } catch (e) {
        console.log("No more pages available or reached the end");
        break;
      }
    }

    // Remove duplicates based on profile link
    const uniqueProfiles = Array.from(
      new Map(profiles.map((item) => [item.link, item])).values()
    );

    res.status(200).json({
      profiles: uniqueProfiles,
      totalProfiles: uniqueProfiles.length,
      pagesScraped: currentPage,
    });
  } catch (error) {
    console.error("Error during scraping:", error);
    res.status(500).send({ error: "An error occurred during scraping" });
  } finally {
    await driver.quit();
  }
});
