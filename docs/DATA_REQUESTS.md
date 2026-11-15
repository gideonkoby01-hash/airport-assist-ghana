# Handling a request about someone's personal data

Use this when a passenger or staff member asks what you hold about them, asks for a correction, or asks you to delete their data. Keep it short and keep a note of what you did. (Have a Ghanaian lawyer confirm the time limits that apply to you.)

## 1. Check who is asking
Reply from the email address on the account, or ask for the booking reference and the phone number given at booking. Do not send personal data to an address that is not on the account.

## 2. What they can ask for

| Request | What to do |
|---|---|
| "What do you have about me?" | In Supabase, open the Table editor and look up their email in `profiles`, their user id in `bookings` (`passenger_user_id`), `booking_ratings`, `notifications`, `supervisor_directory`, and their record and notes in `customers` and `customer_notes`. Send them a plain list: account details, bookings, ratings. Their ID photo is in the `private-files` bucket under their user id folder (it is deleted automatically 30 days after the flight). |
| "Correct my details" | A passenger can add a new booking with the right details. For a mistake on an existing booking, an admin edits the field in the Table editor. The change is recorded in the audit log. |
| "Delete my data" | Admin > Staff Accounts > find the person > **Erase**. This blanks their name, contact numbers, nationality and notes on their bookings and ratings, deletes their ID photo files and notifications, and removes their login. Payment records stay for accounting but no longer identify them. It cannot be undone. |
| "Delete my data" (a customer with no website account, for example a walk-in) | Admin > Customers > open the customer > **Delete personal data**. This removes their name, phone, email, tags and notes and the names on their bookings. Payment records stay. For a customer who has a website account, use Erase in Staff Accounts, which also covers their customer record. |
| "Stop sending me offers" | Admin or Management > Customers > open the customer > untick "This customer has agreed to receive offers" and save. |
| "Stop using my data" | Same as delete, or disable the account (Admin > Staff Accounts > **Disable**) if they only want to stop using the service. |

## 3. After the request
- Write down the date, who asked, what you did, and who did it.
- Reply to the person confirming what was done.
- Remember that backups may hold older copies until the backup expires. Say so if asked.

## 4. Who can view ID photos
Management and admin can view any photo; the assigned supervisor can view the photo on their own booking. Every view of someone else's photo is recorded in the audit log (action `VIEW`, table `private-files`). Admin can read it in Supabase: `select * from audit_log where action = 'VIEW' order by at desc;`
